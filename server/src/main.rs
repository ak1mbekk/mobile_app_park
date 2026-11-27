use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode, Uri},
    response::{IntoResponse, Redirect, Response},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    env, io,
    net::SocketAddr,
    path::{Path, PathBuf},
};
use tokio::net::TcpListener;
use tower_http::services::ServeDir;

mod data;
mod publication;

const RESOURCES: [(&str, &str); 5] = [
    ("catalogue.json", "animals"),
    ("feeding-programme.json", "feedings"),
    ("map-alignment.json", "mapAlignment"),
    ("map-boundaries.json", "enclosures"),
    ("map-guest-paths.json", "visitorPaths"),
];
const RELEASE_FILES: &[&str] = &[
    "index.html",
    "map.html",
    "guide.webmanifest",
    "guide-worker.js",
    "guide-data.js",
    "guide-offline.js",
    "audio-guide.js",
    "audio-stops.js",
    "base.css",
    "catalog-editorial.css",
    "catalog.js",
    "feedings.js",
    "feeding-model.js",
    "feedings.css",
    "guide-shell.css",
    "map-app.css",
    "map-layout.css",
    "map-app-shell.js",
    "map-boundary-geometry.js",
    "map-guest-geometry.js",
    "map-projection.js",
    "park-home.css",
    "park-home.js",
    "guide-history.js",
    "park-map.js",
    "guide-landscape.js",
    "park-schedule.js",
    "places.js",
    "visitor.css",
    "guide-theme.js",
    "guide-ui.css",
    "vendor/leaflet/leaflet.css",
    "vendor/leaflet/leaflet.js",
    "vendor/maplibre/maplibre-gl.css",
    "vendor/maplibre/maplibre-gl.js",
    "vendor/park-menu/menu.css",
    "vendor/slide-tabs/tabs.js",
    "assets/park-landscape.geojson",
    "assets/park-survey.webp",
    "assets/audio/alpaca.mp3",
    "assets/audio/llama.mp3",
    "assets/audio/capybara.mp3",
    "assets/audio/camel-donkey.mp3",
    "assets/audio/lamancha-boer.mp3",
    "assets/audio/caracal.mp3",
    "assets/audio/watusi.mp3",
];

#[derive(Clone)]
struct Guide {
    demo_dir: PathBuf,
    publication: Option<publication::Source>,
}

#[derive(Serialize)]
struct Resource {
    id: &'static str,
    href: String,
    version: String,
    bytes: usize,
}

#[derive(Serialize)]
struct Manifest {
    version: String,
    resources: Vec<Resource>,
}

#[derive(Deserialize)]
struct ResourceVersion {
    v: Option<String>,
}

fn checksum(body: &[u8]) -> String {
    format!("{:x}", Sha256::digest(body))
}

async fn read_json(directory: &Path, file: &str) -> io::Result<Vec<u8>> {
    let body = tokio::fs::read(directory.join(file)).await?;
    let value = serde_json::from_slice(&body)?;
    if !data::valid(file, &value) {
        return Err(io::Error::new(io::ErrorKind::InvalidData, format!("Invalid guide data in {file}")));
    }
    Ok(body)
}

fn json_response(body: Vec<u8>, status: StatusCode, cache: &'static str) -> Response {
    let length = body.len();
    let mut response = Response::new(Body::from(body));
    *response.status_mut() = status;
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json; charset=utf-8"),
    );
    headers.insert(header::CONTENT_LENGTH, HeaderValue::from(length));
    response
}

fn versioned_json(request: &HeaderMap, body: Vec<u8>, version: &str) -> Response {
    let tag = format!("\"{version}\"");
    let unchanged = request
        .get_all(header::IF_NONE_MATCH)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .map(str::trim)
        .any(|value| value == "*" || value.strip_prefix("W/").unwrap_or(value) == tag);

    let mut response = if unchanged {
        let mut response = Response::new(Body::empty());
        *response.status_mut() = StatusCode::NOT_MODIFIED;
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
        response
    } else {
        json_response(body, StatusCode::OK, "no-cache")
    };
    let headers = response.headers_mut();
    headers.insert(
        header::ETAG,
        HeaderValue::from_str(&tag).expect("a quoted SHA-256 is a valid header value"),
    );
    response
}

fn unavailable(error: impl std::fmt::Display) -> Response {
    eprintln!("Guide data unavailable: {error}");
    json_response(
        br#"{"error":"park-data-unavailable"}"#.to_vec(),
        StatusCode::SERVICE_UNAVAILABLE,
        "no-store",
    )
}

async fn check_release(directory: &Path) -> io::Result<()> {
    for file in RELEASE_FILES {
        let metadata = tokio::fs::metadata(directory.join(file)).await
            .map_err(|error| io::Error::new(error.kind(), format!("{file}: {error}")))?;
        if !metadata.is_file() || metadata.len() == 0 {
            return Err(io::Error::new(io::ErrorKind::InvalidData, format!("Missing release content: {file}")));
        }
    }
    load_manifest(directory).await?;
    Ok(())
}

async fn health(State(guide): State<Guide>) -> Response {
    if let Err(error) = check_release(&guide.demo_dir).await {
        return unavailable(error);
    }
    let source: &[u8] = match &guide.publication {
        Some(publication) if publication.current().await.is_none() => return publication_unavailable(),
        Some(_) => br#"{"status":"ok","source":"zookeeper"}"#,
        None => br#"{"status":"ok","source":"park-files"}"#,
    };
    json_response(source.to_vec(), StatusCode::OK, "no-store")
}

async fn load_manifest(directory: &Path) -> io::Result<Vec<u8>> {
    let mut resources = Vec::with_capacity(RESOURCES.len());
    for (file, id) in RESOURCES {
        let body = read_json(directory, file).await?;
        let version = checksum(&body);
        resources.push(Resource {
            id,
            href: format!("/demo/{file}?v={version}"),
            version,
            bytes: body.len(),
        });
    }
    let version = checksum(&serde_json::to_vec(&resources)?);
    Ok(serde_json::to_vec(&Manifest { version, resources })?)
}

async fn manifest(State(guide): State<Guide>, request: HeaderMap) -> Response {
    if let Some(source) = &guide.publication {
        let Some(snapshot) = source.current().await else { return publication_unavailable(); };
        let version = checksum(&snapshot);
        let resources = vec![Resource {
            id: "publication",
            href: format!("/demo/guide-publication.json?v={version}"),
            version: version.clone(),
            bytes: snapshot.len(),
        }];
        let manifest = Manifest { version: version.clone(), resources };
        return versioned_json(&request, serde_json::to_vec(&manifest).expect("serialize guide manifest"), &version);
    }
    match load_manifest(&guide.demo_dir).await {
        Ok(body) => {
            let version = checksum(&body);
            versioned_json(&request, body, &version)
        }
        Err(error) => unavailable(error),
    }
}

fn publication_unavailable() -> Response {
    json_response(br#"{"error":"guide-publication-unavailable"}"#.to_vec(), StatusCode::SERVICE_UNAVAILABLE, "no-store")
}

async fn read_resource(guide: &Guide, file: &str, id: &str) -> io::Result<Vec<u8>> {
    let Some(source) = &guide.publication else { return read_json(&guide.demo_dir, file).await; };
    let snapshot = source.current().await.ok_or_else(|| io::Error::other("ZooKeeper publication is not available"))?;
    let data: serde_json::Value = serde_json::from_slice(&snapshot)?;
    let value = data.get(id).ok_or_else(|| io::Error::other("Resource missing in ZooKeeper publication"))?;
    Ok(serde_json::to_vec(value)?)
}

async fn public_snapshot(State(guide): State<Guide>, Query(pinned): Query<ResourceVersion>, request: HeaderMap) -> Response {
    let Some(source) = &guide.publication else { return StatusCode::NOT_FOUND.into_response(); };
    let Some(snapshot) = source.current().await else { return publication_unavailable(); };
    let version = checksum(&snapshot);
    if pinned.v.is_some_and(|expected| expected != version) {
        return json_response(br#"{"error":"guide-version-changed"}"#.to_vec(), StatusCode::CONFLICT, "no-store");
    }
    versioned_json(&request, snapshot.to_vec(), &version)
}

fn router(guide: Guide) -> Router {
    let mut routes = Router::new()
        .route("/", get(|| async { Redirect::temporary("/demo/index.html") }))
        .route("/demo", get(|uri: Uri| async move {
            let target = uri.query().map_or_else(|| "/demo/".to_owned(), |query| format!("/demo/?{query}"));
            Redirect::permanent(&target)
        }))
        .route("/api/health", get(health))
        .route("/api/v1/guide", get(manifest))
        .route("/demo/guide-publication.json", get(public_snapshot));

    for (file, id) in RESOURCES {
        routes = routes.route(
            &format!("/demo/{file}"),
            get(move |State(guide): State<Guide>, Query(pinned): Query<ResourceVersion>, request: HeaderMap| async move {
                match read_resource(&guide, file, id).await {
                    Ok(body) => {
                        let version = checksum(&body);
                        if pinned.v.is_some_and(|expected| expected != version) {
                            return json_response(br#"{"error":"guide-version-changed"}"#.to_vec(), StatusCode::CONFLICT, "no-store");
                        }
                        versioned_json(&request, body, &version)
                    }
                    Err(error) => unavailable(error),
                }
            }),
        );
    }

    routes
        .nest_service("/demo/", ServeDir::new(&guide.demo_dir))
        .with_state(guide)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let address: SocketAddr = env::var("PARK_GUIDE_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8170".to_owned())
        .parse()?;
    let demo_dir = env::var_os("PARK_GUIDE_DEMO_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("public/demo"))
        .canonicalize()?;
    check_release(&demo_dir).await?;
    let publication = publication::Source::from_env()?;
    if let Some(source) = publication.clone() {
        tokio::spawn(source.poll());
    }

    let listener = TcpListener::bind(address).await?;
    println!("Park guide server listening on http://{}", listener.local_addr()?);
    axum::serve(listener, router(Guide { demo_dir, publication }))
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

async fn shutdown() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        match signal(SignalKind::terminate()) {
            Ok(mut terminate) => {
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => {},
                    _ = terminate.recv() => {},
                }
                return;
            }
            Err(error) => eprintln!("Could not register SIGTERM: {error}"),
        }
    }
    if let Err(error) = tokio::signal::ctrl_c().await {
        eprintln!("Could not register Ctrl+C: {error}");
        std::future::pending::<()>().await;
    }
}
