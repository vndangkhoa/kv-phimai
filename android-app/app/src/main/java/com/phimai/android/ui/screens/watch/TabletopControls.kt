package com.phimai.android.ui.screens.watch

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.phimai.android.data.util.PhimAiUtils
import com.phimai.android.ui.theme.cinema
import kotlinx.coroutines.delay

/**
 * Cinema Noir Tabletop / Flex lower-half control sheet rendered below a
 * horizontally half-open foldable hinge, leaving the upper video clean.
 */
@Composable
fun TabletopVideoControls(
    player: ExoPlayer,
    title: String,
    channelName: String,
    hasNext: Boolean,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onFullscreen: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = cinema
    var isPlaying by remember(player) { mutableStateOf(player.isPlaying) }
    var isEnded by remember(player) { mutableStateOf(player.playbackState == Player.STATE_ENDED) }
    var currentPosition by remember(player) { mutableLongStateOf(player.currentPosition.coerceAtLeast(0L)) }
    var duration by remember(player) { mutableLongStateOf(player.duration.coerceAtLeast(1L)) }
    var isMuted by remember(player) { mutableStateOf(player.volume == 0f) }
    var isScrubbing by remember { mutableStateOf(false) }
    var scrubFraction by remember { mutableFloatStateOf(0f) }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                isEnded = playbackState == Player.STATE_ENDED
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }

    LaunchedEffect(player, isPlaying) {
        currentPosition = player.currentPosition.coerceAtLeast(0L)
        duration = player.duration.coerceAtLeast(1L)
        while (isPlaying) {
            delay(250)
            if (!isScrubbing) {
                currentPosition = player.currentPosition.coerceAtLeast(0L)
                duration = player.duration.coerceAtLeast(1L)
            }
        }
    }

    val liveFraction = (currentPosition.toFloat() / duration.coerceAtLeast(1L).toFloat()).coerceIn(0f, 1f)
    val sliderFraction = if (isScrubbing) scrubFraction else liveFraction
    val displayPos = if (isScrubbing) (scrubFraction * duration).toLong() else currentPosition

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        color = palette.slate
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(width = 36.dp, height = 4.dp)
                        .background(palette.borderEmphasized, RoundedCornerShape(2.dp))
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("Điều khiển Rạp Gập", color = palette.gold, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                IconButton(onClick = onClose, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Filled.Close, contentDescription = "Xem thông tin & tập", tint = palette.ivory)
                }
            }

            HorizontalDivider(color = palette.border)

            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.SpaceEvenly,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = title.ifBlank { "Đang phát" },
                        color = palette.ivory,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        textAlign = TextAlign.Center,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (channelName.isNotBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text(channelName, color = palette.textSecondary, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = {
                        if (player.currentPosition > 3_000L) {
                            player.seekTo(0L)
                            currentPosition = 0L
                        } else {
                            onPrevious()
                        }
                    }, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.Filled.SkipPrevious, contentDescription = "Trước", tint = palette.ivory, modifier = Modifier.size(30.dp))
                    }
                    IconButton(onClick = {
                        val t = (player.currentPosition - 10_000L).coerceAtLeast(0L)
                        player.seekTo(t)
                        currentPosition = t
                    }, modifier = Modifier.size(52.dp)) {
                        Icon(Icons.Filled.Replay10, contentDescription = "-10s", tint = palette.ivory, modifier = Modifier.size(34.dp))
                    }
                    IconButton(onClick = {
                        if (isEnded) {
                            player.seekTo(0L)
                            player.play()
                            isEnded = false
                        } else if (isPlaying) {
                            player.pause()
                        } else {
                            player.play()
                        }
                    }, modifier = Modifier.size(72.dp)) {
                        Icon(
                            imageVector = when {
                                isEnded -> Icons.Filled.Replay
                                isPlaying -> Icons.Filled.Pause
                                else -> Icons.Filled.PlayArrow
                            },
                            contentDescription = if (isPlaying) "Tạm dừng" else "Phát",
                            tint = palette.gold,
                            modifier = Modifier.size(52.dp)
                        )
                    }
                    IconButton(onClick = {
                        val maxDur = player.duration.coerceAtLeast(1L)
                        val t = (player.currentPosition + 10_000L).coerceAtMost(maxDur)
                        player.seekTo(t)
                        currentPosition = t
                    }, modifier = Modifier.size(52.dp)) {
                        Icon(Icons.Filled.Forward10, contentDescription = "+10s", tint = palette.ivory, modifier = Modifier.size(34.dp))
                    }
                    IconButton(
                        onClick = onNext,
                        enabled = hasNext,
                        modifier = Modifier
                            .size(48.dp)
                            .alpha(if (hasNext) 1f else 0.35f)
                    ) {
                        Icon(Icons.Filled.SkipNext, contentDescription = "Tiếp", tint = palette.ivory, modifier = Modifier.size(30.dp))
                    }
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "${PhimAiUtils.formatDurationMs(displayPos)} / ${PhimAiUtils.formatDurationMs(duration)}",
                        color = palette.textSecondary,
                        fontSize = 12.5.sp
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = {
                            isMuted = !isMuted
                            player.volume = if (isMuted) 0f else 1f
                        }, modifier = Modifier.size(34.dp)) {
                            Icon(
                                imageVector = if (isMuted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp,
                                contentDescription = "Âm lượng",
                                tint = palette.textSecondary,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        IconButton(onClick = onFullscreen, modifier = Modifier.size(34.dp)) {
                            Icon(Icons.Filled.Fullscreen, contentDescription = "Toàn màn hình", tint = palette.gold, modifier = Modifier.size(22.dp))
                        }
                    }
                }
                Slider(
                    value = sliderFraction.coerceIn(0f, 1f),
                    onValueChange = { f ->
                        isScrubbing = true
                        scrubFraction = f.coerceIn(0f, 1f)
                    },
                    onValueChangeFinished = {
                        val t = (scrubFraction * duration).toLong().coerceIn(0L, duration)
                        player.seekTo(t)
                        currentPosition = t
                        isScrubbing = false
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = SliderDefaults.colors(
                        thumbColor = palette.crimson,
                        activeTrackColor = palette.crimson,
                        inactiveTrackColor = palette.textMuted.copy(alpha = 0.25f)
                    )
                )
            }
        }
    }
}
