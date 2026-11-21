package com.phimai.android.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.phimai.android.R
import com.phimai.android.data.model.Film
import com.phimai.android.data.util.PhimAiUtils
import com.phimai.android.ui.theme.CinemaRadius
import com.phimai.android.ui.theme.cinema

private const val MAX_EP_CHIPS = 4

@Composable
fun FilmCard(
    film: Film,
    serverUrl: String,
    isSaved: Boolean,
    progressFraction: Float? = null,
    onFilmClick: (Film) -> Unit,
    onToggleSave: (Film) -> Unit,
    onChannelClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = cinema
    val episodes = film.stackedEpisodes.takeIf { it.size > 1 }
    val displayTitle = remember(film.id, film.title, episodes) {
        if (episodes != null) {
            PhimAiUtils.getEpisodeInfo(film.title, film.channel).baseTitle.ifBlank { film.title }
        } else film.title
    }
    val firstTool = remember(film.tool) {
        film.tool.split('•').firstOrNull()?.trim().orEmpty().ifBlank { "AI" }
    }
    val thumbUrl = remember(film.id, film.thumbnailUrl, serverUrl) {
        PhimAiUtils.resolveServerUrl(
            serverUrl,
            film.thumbnailUrl.ifBlank { PhimAiUtils.thumbUrl(serverUrl, film.id) }
        )
    }
    val isFresh = "moi-nhat" in film.tags || film.rank > 9258

    Column(modifier = modifier.fillMaxWidth()) {
        // Stacked deck effect when multi-episode series is collapsed into one card
        Column(modifier = Modifier.fillMaxWidth()) {
            if (episodes != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                        .background(palette.gold.copy(alpha = 0.25f))
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp))
                        .background(palette.slateRaised)
                        .border(0.5.dp, palette.border, RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp))
                )
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(CinemaRadius.container))
                    .background(palette.slateRaised)
                    .border(1.dp, palette.border, RoundedCornerShape(CinemaRadius.container))
                    .clickable { onFilmClick(film) }
            ) {
                Image(
                    painter = painterResource(id = R.drawable.ic_phimai_logo),
                    contentDescription = null,
                    modifier = Modifier
                        .size(42.dp)
                        .align(Alignment.Center)
                        .alpha(0.28f)
                )
                AsyncImage(
                    model = ImageRequest.Builder(LocalContext.current)
                        .data(thumbUrl)
                        .crossfade(true)
                        .build(),
                    contentDescription = film.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )

                // Top-left: MỚI + AI Tool pill
                Row(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (isFresh) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(5.dp))
                                .background(palette.crimson)
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = "MỚI",
                                color = Color.White,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.4.sp
                            )
                        }
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(5.dp))
                            .background(palette.obsidian.copy(alpha = 0.86f))
                            .border(1.dp, palette.gold.copy(alpha = 0.30f), RoundedCornerShape(5.dp))
                            .padding(horizontal = 7.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = firstTool,
                            color = palette.gold,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1
                        )
                    }
                }

                // Top-right: Save bookmark button
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(palette.obsidian.copy(alpha = 0.78f))
                        .border(1.dp, palette.border, CircleShape)
                        .clickable { onToggleSave(film) },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (isSaved) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder,
                        contentDescription = if (isSaved) "Bỏ lưu" else "Lưu xem sau",
                        tint = if (isSaved) palette.gold else palette.ivory,
                        modifier = Modifier.size(16.dp)
                    )
                }

                // Bottom-left: Stacked series episode count badge
                if (episodes != null) {
                    Row(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(start = 8.dp, bottom = 8.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(palette.obsidian.copy(alpha = 0.88f))
                            .border(1.dp, palette.gold.copy(alpha = 0.35f), RoundedCornerShape(5.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Layers,
                            contentDescription = null,
                            tint = palette.gold,
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            text = "${episodes.size} tập",
                            color = palette.gold,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                // Bottom-right: Duration badge
                if (film.dur.isNotBlank()) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(8.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(palette.obsidian.copy(alpha = 0.88f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = film.dur,
                            color = palette.ivory,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1
                        )
                    }
                }

                // Bottom playback progress bar
                if (progressFraction != null && progressFraction > 0.02f) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(3.dp)
                            .align(Alignment.BottomStart)
                            .background(Color.White.copy(alpha = 0.25f))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(progressFraction.coerceIn(0f, 1f))
                                .fillMaxHeight()
                                .background(palette.crimson)
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Metadata Row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top
        ) {
            ChannelInitialAvatar(
                name = film.channel.ifBlank { "PhimAI" },
                size = 36.dp,
                modifier = Modifier.clickable {
                    if (film.channel.isNotBlank()) onChannelClick(film.channel)
                }
            )

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = displayTitle,
                    color = palette.ivory,
                    fontSize = 14.5.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clickable { onFilmClick(film) }
                )

                Spacer(modifier = Modifier.height(3.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.clickable {
                        if (film.channel.isNotBlank()) onChannelClick(film.channel)
                    }
                ) {
                    Text(
                        text = film.channel.ifBlank { "PhimAI" },
                        color = palette.textSecondary,
                        fontSize = 12.5.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Icon(
                        imageVector = Icons.Filled.Verified,
                        contentDescription = null,
                        tint = palette.gold,
                        modifier = Modifier.size(13.dp)
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    modifier = Modifier.padding(top = 2.dp)
                ) {
                    Text(
                        text = PhimAiUtils.formatViewsVN(film.views),
                        color = palette.textMuted,
                        fontSize = 11.5.sp,
                        maxLines = 1
                    )
                    Text("•", color = palette.textDisabled, fontSize = 11.sp)
                    val secondMeta = if (episodes != null) {
                        val firstEp = PhimAiUtils.getEpisodeNumber(episodes.first().title)
                        val lastEp = PhimAiUtils.getEpisodeNumber(episodes.last().title)
                        if (firstEp != null && lastEp != null && lastEp != firstEp) {
                            "Tập $firstEp–$lastEp"
                        } else "${episodes.size} tập"
                    } else {
                        PhimAiUtils.catLabel(film.cat)
                    }
                    Text(
                        text = secondMeta,
                        color = palette.textMuted,
                        fontSize = 11.5.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (film.rank > 0) {
                        Text("•", color = palette.textDisabled, fontSize = 11.sp)
                        Text(
                            text = "#${film.rank}",
                            color = palette.gold,
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            softWrap = false
                        )
                    }
                }

                // Stacked Episode Quick-Chips
                if (episodes != null) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(top = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        episodes.take(MAX_EP_CHIPS).forEachIndexed { idx, ep ->
                            val epNum = PhimAiUtils.getEpisodeNumber(ep.title) ?: (idx + 1)
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = palette.slateRaised,
                                border = BorderStroke(1.dp, palette.border),
                                modifier = Modifier.clickable { onFilmClick(ep) }
                            ) {
                                Text(
                                    text = "Tập $epNum",
                                    color = palette.textSecondary,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }
                        if (episodes.size > MAX_EP_CHIPS) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = palette.goldMuted,
                                border = BorderStroke(1.dp, palette.gold.copy(alpha = 0.35f)),
                                modifier = Modifier.clickable { onFilmClick(episodes[MAX_EP_CHIPS]) }
                            ) {
                                Text(
                                    text = "+${episodes.size - MAX_EP_CHIPS}",
                                    color = palette.gold,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
