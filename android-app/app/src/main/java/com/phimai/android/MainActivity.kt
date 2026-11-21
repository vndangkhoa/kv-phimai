package com.phimai.android

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.phimai.android.player.PlaybackManager
import com.phimai.android.ui.MainScreen
import com.phimai.android.ui.adaptive.ProvideWidthClass
import com.phimai.android.ui.components.PhimAiLogo
import com.phimai.android.ui.screens.watch.ExoPlayerView
import com.phimai.android.ui.theme.CinemaPalette
import com.phimai.android.ui.theme.PhimAiTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var playbackManager: PlaybackManager

    private val _isInPipMode = MutableStateFlow(false)
    val isInPipMode: StateFlow<Boolean> = _isInPipMode

    private val _pipVideoUrl = MutableStateFlow<String?>(null)
    val pipVideoUrl: StateFlow<String?> = _pipVideoUrl

    private val _pipAudioUrl = MutableStateFlow<String?>(null)
    val pipAudioUrl: StateFlow<String?> = _pipAudioUrl

    fun setPipVideo(videoUrl: String, audioUrl: String?) {
        _pipVideoUrl.value = videoUrl
        _pipAudioUrl.value = audioUrl
    }

    private val notificationPermissionRequest = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {}

    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionRequest.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        ensureNotificationPermission()
        window.decorView.setBackgroundColor(0xFF0D0E14.toInt())

        setContent {
            val isInPip by isInPipMode.collectAsState()
            val pipVideoUrl by pipVideoUrl.collectAsState()
            val pipAudioUrl by pipAudioUrl.collectAsState()

            PhimAiTheme {
                ProvideWidthClass {
                    Surface(modifier = Modifier.fillMaxSize(), color = CinemaPalette.obsidian) {
                        if (isInPip && pipVideoUrl != null) {
                            LaunchedEffect(pipVideoUrl, pipAudioUrl) {
                                val url = pipVideoUrl!!
                                if (!playbackManager.isLoadedFor(url)) {
                                    val id = playbackManager.nowPlaying.value?.filmId?.ifBlank { null } ?: "pip"
                                    playbackManager.playDirect(id, url, pipAudioUrl)
                                }
                            }
                            ExoPlayerView(
                                videoUrl = pipVideoUrl!!,
                                audioUrl = pipAudioUrl,
                                sharedPlayer = playbackManager.player,
                                isFullscreen = true,
                                modifier = Modifier.fillMaxSize()
                            )
                        } else {
                            AppEntry()
                        }
                    }
                }
            }
        }
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        _isInPipMode.value = isInPictureInPictureMode
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }
}

@Composable
private fun AppEntry() {
    var showSplash by remember { mutableStateOf(true) }

    Box(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .scale(
                    animateFloatAsState(
                        targetValue = if (showSplash) 0.96f else 1f,
                        animationSpec = spring(
                            dampingRatio = Spring.DampingRatioMediumBouncy,
                            stiffness = Spring.StiffnessLow
                        ),
                        label = "contentScale"
                    ).value
                )
        ) {
            MainScreen()
        }

        AnimatedVisibility(
            visible = showSplash,
            enter = fadeIn(tween(250)),
            exit = fadeOut(tween(350)) + scaleOut(targetScale = 1.12f, animationSpec = tween(350)),
            modifier = Modifier.fillMaxSize()
        ) {
            CinemaSplash()
        }
    }

    LaunchedEffect(Unit) {
        delay(900)
        showSplash = false
    }
}

@Composable
private fun CinemaSplash() {
    var targetScale by remember { mutableStateOf(0.75f) }
    val scale by animateFloatAsState(
        targetValue = targetScale,
        animationSpec = spring(Spring.DampingRatioMediumBouncy, Spring.StiffnessLow),
        label = "splashLogo"
    )
    LaunchedEffect(Unit) { targetScale = 1f }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(CinemaPalette.obsidian),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.scale(scale)
        ) {
            PhimAiLogo(iconSize = 56.dp, showWordmark = true, show4KBadge = true)
            Text(
                text = "Cinema Noir • 4K Adaptive Stream",
                color = CinemaPalette.textMuted,
                fontSize = 12.sp
            )
        }
    }
}
