use crate::data;
use reqwest::{header::HeaderValue, redirect::Policy, Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashSet, env, io, sync::Arc, time::Duration};
use tokio::sync::RwLock;

const MAX_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone)]
pub struct Source(Arc<Upstream>);

struct Upstream {
    client: Client,
    url: Url,
    key: HeaderValue,
    current: RwLock<Option<Arc<[u8]>>>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Publication {
    animals: Vec<Animal>,
    places: Vec<Place>,
    map_alignment: Value,
    enclosures: Value,
    visitor_paths: Value,
    feedings: Value,
}

#[derive(Deserialize, Serialize)]
struct Animal {
    slug: String,
    name: String,
    category: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    scientific: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    thumbnail: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Place {
    zone: u8,
    id: String,
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    geo: Option<[f64; 2]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    service: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    audio_story: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    legacy_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    species: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    keywords: Vec<String>,
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn identifier(id: &str) -> bool {
    !id.is_empty() && id.len() <= 120 &&
      id.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
}

fn asset(path: &str) -> bool {
    path.strip_prefix("assets/").is_some_and(|path| path.split('/').all(|part|
        identifier(part) && !matches!(part, "." | "..")))
}

fn keep_fields(value: &mut Value, fields: &[&str]) {
    if let Some(object) = value.as_object_mut() {
        object.retain(|key, _| fields.contains(&key.as_str()));
    }
}

fn public_feedings(rows: &mut Value) {
    if let Some(rows) = rows.as_array_mut() {
        for row in rows {
            keep_fields(row, &["id", "zone", "place", "start", "end", "name", "status", "species"]);
            if let Some(species) = row.get_mut("species") {
                if !species.as_array().is_some_and(|entries| entries.iter().all(Value::is_string)) {
                    *species = Value::Array(Vec::new());
                }
            }
        }
    }
}

fn project(body: &[u8]) -> io::Result<Vec<u8>> {
    let mut publication: Publication = serde_json::from_slice(body)?;
    let mut slugs = HashSet::new();
    if publication.animals.is_empty() || publication.animals.iter().any(|animal|
        !identifier(&animal.slug) || !slugs.insert(animal.slug.as_str()) ||
        animal.name.trim().is_empty() || animal.category.trim().is_empty() ||
        animal.thumbnail.as_deref().is_some_and(|path| !asset(path))
    ) { return Err(invalid("Invalid public animal catalog")); }

    let mut ids = HashSet::new();
    if publication.places.is_empty() || publication.places.iter().any(|place|
        !matches!(place.zone, 1 | 2) || !identifier(&place.id) ||
        !ids.insert((place.zone, place.id.as_str())) || place.name.trim().is_empty() ||
        place.legacy_id.as_deref().is_some_and(|id| !identifier(id)) ||
        place.species.iter().any(|slug| !slugs.contains(slug.as_str())) ||
        place.geo.is_some_and(|[lng, lat]| !(-180.0..=180.0).contains(&lng) || !(-90.0..=90.0).contains(&lat))
    ) { return Err(invalid("Invalid public map places")); }

    keep_fields(&mut publication.map_alignment, &["raster", "revision", "centerX", "centerY", "scale", "angle"]);
    keep_fields(&mut publication.enclosures, &["raster", "revision", "enclosures", "schematic", "segments"]);
    keep_fields(&mut publication.visitor_paths, &["revision", "paths"]);
    if let Some(paths) = publication.visitor_paths.get_mut("paths").and_then(Value::as_array_mut) {
        for path in paths { keep_fields(path, &["id", "zone", "name", "status", "points"]); }
    }
    keep_fields(&mut publication.feedings, &["verifiedOn", "daily", "byDate"]);
    if let Some(daily) = publication.feedings.get_mut("daily") { public_feedings(daily); }
    if let Some(dates) = publication.feedings.get_mut("byDate").and_then(Value::as_object_mut) {
        for rows in dates.values_mut() { public_feedings(rows); }
    }
    for (name, value) in [
        ("map-alignment.json", &publication.map_alignment),
        ("map-boundaries.json", &publication.enclosures),
        ("map-guest-paths.json", &publication.visitor_paths),
        ("feeding-programme.json", &publication.feedings)
    ] {
        if !data::valid(name, value) { return Err(invalid("Invalid visitor publication")); }
    }
    Ok(serde_json::to_vec(&publication)?)
}

impl Source {
    pub fn from_env() -> Result<Option<Self>, Box<dyn std::error::Error>> {
        let Ok(endpoint) = env::var("PARK_GUIDE_ZOOKEEPER_EXPORT_URL") else { return Ok(None); };
        let url = Url::parse(&endpoint).map_err(|_| invalid("Invalid ZooKeeper export URL"))?;
        let local = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
        if (url.scheme() != "https" && !(local && url.scheme() == "http")) ||
            url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some()
        { return Err(invalid("Use HTTPS for the ZooKeeper export").into()); }
        let token = env::var("PARK_GUIDE_ZOOKEEPER_READ_KEY")
            .map_err(|_| invalid("Missing ZooKeeper read key"))?;
        if token.trim().is_empty() { return Err(invalid("Missing ZooKeeper read key").into()); }
        let mut key = HeaderValue::from_str(&token).map_err(|_| invalid("Invalid ZooKeeper read key"))?;
        key.set_sensitive(true);
        let client = Client::builder().redirect(Policy::none()).timeout(Duration::from_secs(8)).build()?;
        Ok(Some(Self(Arc::new(Upstream { client, url, key, current: RwLock::new(None) }))))
    }

    pub async fn current(&self) -> Option<Arc<[u8]>> {
        self.0.current.read().await.clone()
    }

    pub async fn refresh(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut response = self.0.client.get(self.0.url.clone()).header("X-API-Key", self.0.key.clone())
            .send().await?.error_for_status()?;
        if !response.status().is_success() { return Err(invalid("ZooKeeper did not return a public snapshot").into()); }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if body.len() + chunk.len() > MAX_BYTES { return Err(invalid("Public snapshot exceeds limit").into()); }
            body.extend_from_slice(&chunk);
        }
        *self.0.current.write().await = Some(Arc::from(project(&body)?));
        Ok(())
    }

    pub async fn poll(self) {
        loop {
            if self.refresh().await.is_err() {
                eprintln!("ZooKeeper public snapshot unavailable or invalid");
            }
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    }
}
