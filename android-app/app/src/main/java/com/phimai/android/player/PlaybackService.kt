package com.phimai.android.player

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.OptIn
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.media.app.NotificationCompat.MediaStyle
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import coil3.BitmapImage
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.size.Size
import com.phimai.android.MainActivity
import com.phimai.android.R
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.runBlocking
import java.util.concurrent.Executors
import javax.inject.Inject

@OptIn(UnstableApi::class)
@AndroidEntryPoint
class PlaybackService : MediaSessionService() {

    companion object {
        private const val TAG = "PhimAiPlaybackService"
        private const val CHANNEL_ID = "phimai_playback"
        private const val NOTIFICATION_ID = 4721
        const val ACTION_TOGGLE = "com.phimai.android.player.TOGGLE"
        const val ACTION_REWIND = "com.phimai.android.player.REWIND"
        const val ACTION_FORWARD = "com.phimai.android.player.FORWARD"
        private const val CARD_ACCENT_COLOR = 0xFFE50914.toInt()
    }

    @Inject
    lateinit var playbackManager: PlaybackManager

    private var mediaSession: MediaSession? = null
    private var largeIconBitmap: Bitmap? = null
    private var loadedThumbUrl: String? = null
    private val artworkExecutor = Executors.newSingleThreadExecutor()

    override fun onCreate() {
        super.onCreate()
        dischargeForegroundObligation()

        val callback = object : MediaSession.Callback {}
        mediaSession = runCatching {
            val sessionActivity = PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            MediaSession.Builder(this, playbackManager.player)
                .setCallback(callback)
                .setSessionActivity(sessionActivity)
                .build()
        }.getOrElse {
            MediaSession.Builder(this, playbackManager.player)
                .setCallback(callback)
                .build()
        }

        playbackManager.player.addListener(object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) {
                if (events.containsAny(
                        Player.EVENT_PLAYBACK_STATE_CHANGED,
                        Player.EVENT_IS_PLAYING_CHANGED,
                        Player.EVENT_MEDIA_ITEM_TRANSITION,
                        Player.EVENT_MEDIA_METADATA_CHANGED,
                        Player.EVENT_POSITION_DISCONTINUITY
                    )
                ) {
                    updateMediaCard()
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_IDLE && playbackManager.player.mediaItemCount == 0) {
                    stopSelf()
                }
            }
        })

        updateMediaCard()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        when (intent?.action) {
            ACTION_TOGGLE -> playbackManager.togglePlayPause()
            ACTION_REWIND -> runCatching {
                val p = playbackManager.player
                p.seekTo((p.currentPosition - 10_000L).coerceAtLeast(0L))
            }
            ACTION_FORWARD -> runCatching {
                val p = playbackManager.player
                val dur = p.duration.takeIf { it > 0 } ?: Long.MAX_VALUE
                p.seekTo((p.currentPosition + 10_000L).coerceAtMost(dur))
            }
        }
        return START_STICKY
    }

    private fun dischargeForegroundObligation() {
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "PhimAI Phát Video",
                    NotificationManager.IMPORTANCE_LOW
                ).apply { description = "Điều khiển phát phim PhimAI" }
                getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
            }
            val notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notif_play)
                .setContentTitle("PhimAI 4K")
                .setContentText("Đang chuẩn bị phát...")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                } else 0
            )
        }.onFailure { Log.w(TAG, "startForeground failed: ${it.message}") }
    }

    @Suppress("DEPRECATION")
    private fun updateMediaCard() {
        runCatching {
            val session = mediaSession ?: return
            val player = playbackManager.player
            if (player.mediaItemCount == 0) return

            val meta = playbackManager.nowPlaying.value
            val title = meta?.title?.takeIf { it.isNotBlank() } ?: "PhimAI"
            val subtitle = meta?.channelTitle.orEmpty()
            val isPlaying = player.isPlaying

            val contentIntent = PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val builder = NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(if (isPlaying) R.drawable.ic_notif_pause else R.drawable.ic_notif_play)
                .setContentTitle(title)
                .setContentText(subtitle)
                .setContentIntent(contentIntent)
                .setOngoing(isPlaying)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setShowWhen(false)
                .setColor(CARD_ACCENT_COLOR)
                .addAction(R.drawable.ic_notif_rewind, "Tua lùi 10s", servicePendingIntent(ACTION_REWIND, 2))
                .addAction(
                    if (isPlaying) R.drawable.ic_notif_pause else R.drawable.ic_notif_play,
                    if (isPlaying) "Tạm dừng" else "Phát",
                    servicePendingIntent(ACTION_TOGGLE, 1)
                )
                .addAction(R.drawable.ic_notif_forward, "Tua tới 10s", servicePendingIntent(ACTION_FORWARD, 3))

            largeIconBitmap?.let { builder.setLargeIcon(it) }
            builder.setStyle(
                MediaStyle()
                    .setMediaSession(session.getSessionCompatToken())
                    .setShowActionsInCompactView(0, 1, 2)
            )
            getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, builder.build())
            loadArtworkAsync(meta?.thumbnail)
        }
    }

    private fun servicePendingIntent(action: String, requestCode: Int): PendingIntent =
        PendingIntent.getService(
            this,
            requestCode,
            Intent(this, PlaybackService::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    private fun loadArtworkAsync(thumbUrl: String?) {
        if (thumbUrl.isNullOrBlank() || thumbUrl == loadedThumbUrl) return
        loadedThumbUrl = thumbUrl
        artworkExecutor.execute {
            runCatching {
                val res = runBlocking {
                    SingletonImageLoader.get(this@PlaybackService).execute(
                        ImageRequest.Builder(this@PlaybackService)
                            .data(thumbUrl)
                            .size(Size(512, 512))
                            .allowHardware(false)
                            .build()
                    )
                }
                val bmp = ((res as? SuccessResult)?.image as? BitmapImage)?.bitmap
                if (bmp != null && thumbUrl == loadedThumbUrl) {
                    largeIconBitmap = bmp
                    Handler(Looper.getMainLooper()).post { updateMediaCard() }
                }
            }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = mediaSession?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0 || player.playbackState == Player.STATE_ENDED) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        artworkExecutor.shutdownNow()
        runCatching { getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID) }
        mediaSession?.release()
        mediaSession = null
        super.onDestroy()
    }
}
