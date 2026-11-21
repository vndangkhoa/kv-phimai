package com.phimai.tv.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.foundation.PivotOffsets
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.itemsIndexed
import androidx.tv.material3.Border
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.phimai.tv.data.api.TvPhimAiApi
import com.phimai.tv.data.util.TvPhimAiUtils
import com.phimai.tv.ui.components.PhimAiTvCategoryRow
import com.phimai.tv.ui.theme.TvCinema
import com.phimai.tv.viewmodel.DetailViewModel

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun DetailScreen(
    filmId: String,
    onPlayClick: (String) -> Unit,
    onChannelClick: (String) -> Unit,
    onRelatedClick: (String) -> Unit,
    vm: DetailViewModel = viewModel()
) {
    val state by vm.state.collectAsState()
    val serverUrl by TvPhimAiApi.serverFlow.collectAsState()
    val playFocus = remember { FocusRequester() }

    LaunchedEffect(filmId) { vm.load(filmId) }

    if (state.isLoading && state.film == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = TvCinema.Gold)
        }
        return
    }

    val film = state.film
    if (film == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(state.error ?: "Không tìm thấy phim", color = TvCinema.CrimsonSoft)
                Button(onClick = { vm.load(filmId) }) { Text("Thử lại") }
            }
        }
        return
    }

    LaunchedEffect(film.id) {
        runCatching { playFocus.requestFocus() }
    }

    val backdrop = TvPhimAiUtils.resolveServerUrl(
        serverUrl,
        film.thumbnailUrl.ifBlank { TvPhimAiUtils.thumbUrl(serverUrl, film.id) }
    )

    Box(Modifier.fillMaxSize().background(TvCinema.Obsidian)) {
        AsyncImage(
            model = backdrop,
            contentDescription = film.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )
        Box(
            Modifier.fillMaxSize().background(
                Brush.horizontalGradient(
                    listOf(TvCinema.Obsidian, TvCinema.Obsidian.copy(alpha = 0.90f), TvCinema.Obsidian.copy(alpha = 0.55f))
                )
            )
        )
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    listOf(TvCinema.Obsidian.copy(alpha = 0.35f), TvCinema.Obsidian.copy(alpha = 0.72f), TvCinema.Obsidian)
                )
            )
        )

        TvLazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = 24.dp, bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            pivotOffsets = PivotOffsets(parentFraction = 0.52f)
        ) {
            item {
                Column(
                    Modifier
                        .fillMaxWidth(0.76f)
                        .padding(horizontal = 36.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (film.rank > 0) {
                            Text("#${film.rank}", color = TvCinema.Gold, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                        Text(film.tool.ifBlank { "AI" }, color = TvCinema.Gold, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                        if (film.dur.isNotBlank()) {
                            Text("• ${film.dur}", color = TvCinema.TextSecondary, fontSize = 12.5.sp)
                        }
                        if (state.rating.n > 0) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                Icon(Icons.Filled.Star, contentDescription = null, tint = TvCinema.Gold, modifier = Modifier.size(14.dp))
                                Text("%.1f".format(state.rating.average), color = TvCinema.Gold, fontSize = 12.5.sp)
                            }
                        }
                    }

                    Text(
                        text = film.title,
                        color = TvCinema.Ivory,
                        fontSize = 24.sp,
                        lineHeight = 30.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )

                    val channelViews = TvPhimAiUtils.formatChannelViews(film.channel, film.views)
                    if (channelViews.isNotBlank()) {
                        Text(
                            text = channelViews,
                            color = TvCinema.TextSecondary,
                            fontSize = 14.sp
                        )
                    }

                    val synopsis = film.blurbLong.ifBlank { film.blurb }
                    if (synopsis.isNotBlank()) {
                        Text(
                            text = synopsis,
                            color = TvCinema.TextMuted,
                            fontSize = 13.5.sp,
                            lineHeight = 19.sp,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier.padding(horizontal = 36.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Button(
                        onClick = { onPlayClick(film.id) },
                        colors = ButtonDefaults.colors(
                            containerColor = TvCinema.Gold,
                            contentColor = TvCinema.Obsidian,
                            focusedContainerColor = Color.White,
                            focusedContentColor = TvCinema.Obsidian
                        ),
                        modifier = Modifier.focusRequester(playFocus)
                    ) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = if (state.savedPositionMs > 5_000L) {
                                "Tiếp tục (${TvPhimAiUtils.formatClockMs(state.savedPositionMs)})"
                            } else "Phát ngay",
                            fontWeight = FontWeight.Bold
                        )
                    }

                    OutlinedButton(onClick = { vm.toggleSave() }) {
                        Icon(Icons.Filled.Bookmark, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(if (state.isSaved) "Đã lưu" else "Xem sau")
                    }

                    if (film.channel.isNotBlank()) {
                        OutlinedButton(onClick = { onChannelClick(film.channel) }) {
                            Text("Kênh: ${film.channel}", maxLines = 1)
                        }
                    }

                    if (state.episodes.isNotEmpty() || TvPhimAiUtils.getEpisodeNumber(film.title) != null) {
                        OutlinedButton(onClick = { vm.discoverEpisodes() }) {
                            Icon(Icons.Filled.Search, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(if (state.isDiscoveringEpisodes) "Đang tìm..." else "Tìm thêm tập")
                        }
                    }
                }
            }

            if (state.episodes.size > 1) {
                item {
                    Column {
                        Text(
                            text = "Danh sách tập (${state.episodes.size})",
                            color = TvCinema.Gold,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 36.dp, vertical = 6.dp)
                        )
                        TvLazyRow(
                            contentPadding = PaddingValues(horizontal = 36.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            itemsIndexed(state.episodes) { idx, ep ->
                                val active = ep.id == film.id
                                val epNum = TvPhimAiUtils.getEpisodeNumber(ep.title) ?: (idx + 1)
                                Surface(
                                    onClick = { onPlayClick(ep.id) },
                                    shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(8.dp)),
                                    scale = ClickableSurfaceDefaults.scale(focusedScale = 1.07f),
                                    colors = ClickableSurfaceDefaults.colors(
                                        containerColor = if (active) TvCinema.Gold else TvCinema.SlateRaised,
                                        focusedContainerColor = TvCinema.Gold,
                                        contentColor = if (active) TvCinema.Obsidian else TvCinema.Ivory,
                                        focusedContentColor = TvCinema.Obsidian
                                    ),
                                    border = ClickableSurfaceDefaults.border(
                                        border = Border(BorderStroke(1.dp, TvCinema.Border)),
                                        focusedBorder = Border(BorderStroke(2.dp, Color.White))
                                    )
                                ) {
                                    Text(
                                        text = "Tập $epNum",
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 9.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (state.related.isNotEmpty()) {
                item {
                    PhimAiTvCategoryRow(
                        title = "Phim đề xuất tiếp theo",
                        films = state.related,
                        serverUrl = serverUrl,
                        onFilmClick = { onRelatedClick(it.id) }
                    )
                }
            }
        }
    }
}
