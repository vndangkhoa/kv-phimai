package com.phimai.tv.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.itemsIndexed
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Glow
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.phimai.tv.R
import com.phimai.tv.data.api.TvPhimAiApi
import com.phimai.tv.data.model.TvFilm
import com.phimai.tv.data.util.TvPhimAiUtils
import com.phimai.tv.ui.theme.TvCinema
import kotlinx.coroutines.delay

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PhimAiTvFilmCard(
    film: TvFilm,
    serverUrl: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    progressFraction: Float? = null
) {
    var isFocused by remember { mutableStateOf(false) }
    LaunchedEffect(isFocused) {
        if (isFocused && film.id.isNotBlank()) {
            delay(120)
            TvPhimAiApi.prefetchVideo(film.id)
        }
    }

    val episodes = film.stackedEpisodes.takeIf { it.size > 1 }
    val displayTitle = remember(film.id, film.title, episodes) {
        if (episodes != null) TvPhimAiUtils.getEpisodeInfo(film.title, film.channel).baseTitle.ifBlank { film.title }
        else film.title
    }
    val thumb = remember(film.id, film.thumbnailUrl, serverUrl) {
        TvPhimAiUtils.resolveServerUrl(
            serverUrl,
            film.thumbnailUrl.ifBlank { TvPhimAiUtils.thumbUrl(serverUrl, film.id) }
        )
    }
    val toolChip = film.tool.split('•').firstOrNull()?.trim().orEmpty().ifBlank { "AI" }

    Card(
        onClick = onClick,
        modifier = modifier
            .width(276.dp)
            .onFocusChanged { isFocused = it.isFocused },
        shape = CardDefaults.shape(RoundedCornerShape(12.dp)),
        scale = CardDefaults.scale(focusedScale = 1.07f),
        border = CardDefaults.border(focusedBorder = Border(BorderStroke(2.dp, TvCinema.Gold))),
        glow = CardDefaults.glow(focusedGlow = Glow(elevationColor = TvCinema.Gold.copy(alpha = 0.35f), elevation = 14.dp)),
        colors = CardDefaults.colors(containerColor = Color.Transparent, focusedContainerColor = Color.Transparent)
    ) {
        Column(Modifier.fillMaxWidth()) {
            if (episodes != null) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp)
                        .height(3.dp)
                        .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                        .background(TvCinema.Gold.copy(alpha = 0.45f))
                )
            }
            Box(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(TvCinema.SlateRaised)
            ) {
                Image(
                    painter = painterResource(id = R.drawable.ic_phimai_logo),
                    contentDescription = null,
                    modifier = Modifier
                        .size(44.dp)
                        .align(Alignment.Center)
                        .alpha(0.28f)
                )
                AsyncImage(
                    model = ImageRequest.Builder(LocalContext.current).data(thumb).crossfade(false).build(),
                    contentDescription = film.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
                Row(
                    Modifier
                        .align(Alignment.TopStart)
                        .padding(7.dp),
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    if ("moi-nhat" in film.tags || film.rank > 9258) {
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(TvCinema.Crimson)
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text("MỚI", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(TvCinema.Obsidian.copy(alpha = 0.85f))
                            .border(1.dp, TvCinema.Gold.copy(alpha = 0.35f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(toolChip, color = TvCinema.Gold, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
                if (episodes != null) {
                    Row(
                        Modifier
                            .align(Alignment.BottomStart)
                            .padding(7.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(TvCinema.Obsidian.copy(alpha = 0.88f))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(Icons.Filled.Layers, contentDescription = null, tint = TvCinema.Gold, modifier = Modifier.size(12.dp))
                        Text("${episodes.size} tập", color = TvCinema.Gold, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                    }
                }
                if (film.dur.isNotBlank()) {
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .padding(7.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(TvCinema.Obsidian.copy(alpha = 0.88f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(film.dur, color = TvCinema.Ivory, fontSize = 10.5.sp, fontWeight = FontWeight.Medium)
                    }
                }
                if (progressFraction != null && progressFraction > 0.02f) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(3.dp)
                            .align(Alignment.BottomStart)
                            .background(Color.White.copy(alpha = 0.25f))
                    ) {
                        Box(
                            Modifier
                                .fillMaxWidth(progressFraction.coerceIn(0f, 1f))
                                .fillMaxHeight()
                                .background(TvCinema.Crimson)
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top
            ) {
                Box(
                    Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(TvCinema.SlateRaised),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = film.channel.trim().take(1).uppercase().ifBlank { "P" },
                        color = TvCinema.Gold,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        text = displayTitle,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        color = TvCinema.Ivory,
                        style = MaterialTheme.typography.titleSmall.copy(lineHeight = 17.sp)
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(
                        text = TvPhimAiUtils.formatChannelViews(film.channel, film.views),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = TvCinema.TextMuted,
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp)
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PhimAiTvHeroCard(
    film: TvFilm,
    serverUrl: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val thumb = TvPhimAiUtils.resolveServerUrl(
        serverUrl,
        film.thumbnailUrl.ifBlank { TvPhimAiUtils.thumbUrl(serverUrl, film.id) }
    )
    val episodes = film.stackedEpisodes.takeIf { it.size > 1 }
    Card(
        onClick = onClick,
        modifier = modifier
            .width(448.dp)
            .height(252.dp),
        shape = CardDefaults.shape(RoundedCornerShape(16.dp)),
        scale = CardDefaults.scale(focusedScale = 1.04f),
        border = CardDefaults.border(focusedBorder = Border(BorderStroke(2.dp, TvCinema.Gold))),
        glow = CardDefaults.glow(focusedGlow = Glow(elevationColor = TvCinema.Gold.copy(alpha = 0.4f), elevation = 16.dp)),
        colors = CardDefaults.colors(containerColor = TvCinema.Slate)
    ) {
        Box(Modifier.fillMaxSize()) {
            Image(
                painter = painterResource(id = R.drawable.ic_phimai_logo),
                contentDescription = null,
                modifier = Modifier
                    .size(56.dp)
                    .align(Alignment.Center)
                    .alpha(0.25f)
            )
            AsyncImage(model = thumb, contentDescription = film.title, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color.Transparent, TvCinema.Obsidian.copy(alpha = 0.45f), TvCinema.Obsidian.copy(alpha = 0.92f))
                        )
                    )
            )
            Column(
                Modifier
                    .align(Alignment.BottomStart)
                    .padding(16.dp)
                    .fillMaxWidth(0.92f)
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (film.rank > 0) {
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(TvCinema.Gold)
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text("#${film.rank}", color = TvCinema.Obsidian, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    if (episodes != null) {
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(TvCinema.Crimson)
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text("${episodes.size} TẬP", color = Color.White, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    text = film.title,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color = TvCinema.Ivory,
                    style = MaterialTheme.typography.headlineSmall.copy(fontSize = 16.5.sp, fontWeight = FontWeight.Bold)
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = TvPhimAiUtils.formatChannelViews(film.channel, film.views),
                    color = TvCinema.TextSecondary,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PhimAiTvCategoryRow(
    title: String,
    films: List<TvFilm>,
    serverUrl: String,
    progressMap: Map<String, Float> = emptyMap(),
    onFilmClick: (TvFilm) -> Unit
) {
    if (films.isEmpty()) return
    val distinct = remember(films) { films.distinctBy { it.id } }
    Column(Modifier.padding(vertical = 8.dp)) {
        if (title.isNotBlank()) {
            Text(
                text = title,
                color = TvCinema.Ivory,
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 17.sp, fontWeight = FontWeight.Bold),
                modifier = Modifier.padding(start = 32.dp, bottom = 8.dp)
            )
        }
        TvLazyRow(
            contentPadding = PaddingValues(horizontal = 32.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            itemsIndexed(distinct, key = { _, f -> "${title}_${f.id}" }) { _, film ->
                PhimAiTvFilmCard(
                    film = film,
                    serverUrl = serverUrl,
                    progressFraction = progressMap[film.id],
                    onClick = { onFilmClick(film) }
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PhimAiTvHeroRow(
    title: String,
    films: List<TvFilm>,
    serverUrl: String,
    onFilmClick: (TvFilm) -> Unit
) {
    if (films.isEmpty()) return
    Column(Modifier.padding(vertical = 8.dp)) {
        Text(
            text = title,
            color = TvCinema.Gold,
            style = MaterialTheme.typography.titleLarge.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold),
            modifier = Modifier.padding(start = 32.dp, bottom = 10.dp)
        )
        TvLazyRow(
            contentPadding = PaddingValues(horizontal = 32.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            itemsIndexed(films.take(6), key = { _, f -> "hero_${f.id}" }) { _, film ->
                PhimAiTvHeroCard(film = film, serverUrl = serverUrl, onClick = { onFilmClick(film) })
            }
        }
    }
}

@Composable
fun PhimAiTvLoadingScreen(isLoading: Boolean) {
    AnimatedVisibility(visible = isLoading, exit = fadeOut()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(TvCinema.Obsidian),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Image(
                    painter = painterResource(id = R.drawable.ic_phimai_logo),
                    contentDescription = "PhimAI TV",
                    modifier = Modifier
                        .size(72.dp)
                        .clip(RoundedCornerShape(16.dp))
                )
                Text("PhimAI TV 4K", color = TvCinema.Ivory, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                CircularProgressIndicator(color = TvCinema.Gold, strokeWidth = 3.dp, modifier = Modifier.size(34.dp))
            }
        }
    }
}
