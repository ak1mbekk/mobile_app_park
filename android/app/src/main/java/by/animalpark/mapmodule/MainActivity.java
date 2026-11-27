package by.animalpark.mapmodule;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int REQUEST_NOTIFICATIONS = 1001;
    private static final String NOTIFICATIONS_REQUESTED = "notifications_requested";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onPostResume() {
        super.onPostResume();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;

        var preferences = getPreferences(MODE_PRIVATE);
        if (preferences.getBoolean(NOTIFICATIONS_REQUESTED, false)) return;
        preferences.edit().putBoolean(NOTIFICATIONS_REQUESTED, true).apply();

        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
        }
    }
}
