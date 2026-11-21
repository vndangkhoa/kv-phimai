package com.phimai.android.ui.screens.channels

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.phimai.android.data.util.PhimAiUtils
import com.phimai.android.ui.components.CenteredContent
import com.phimai.android.ui.components.ChannelInitialAvatar
import com.phimai.android.ui.components.FilmCard
import com.phimai.android.ui.components.gridHorizontalSpacing
import com.phimai.android.ui.components.gridVerticalSpacing
import com.phimai.android.ui.components.rememberVideoGridCells
import com.phimai.android.ui.theme.CinemaRadius
import com.phimai.android.ui.theme.cinema

@Composable
fun ChannelDetailScreen(
    channelName: String,
    onBack: () -> Unit,
    onFilmClick: (String) -> Unit,
    viewModel: ChannelsViewModel = hiltViewModel()
) {
    val palette = cinema
    val state by viewModel.detailState.collectAsState()
    val serverUrl by viewModel.serverUrl.collectAsState()
    val savedIds by viewModel.savedIds.collectAsState()
    val progressMap by viewModel.progressMap.collectAsState()

    LaunchedEffect(channelName) {
        viewModel.loadChannelDetail(channelName)
    }

    CenteredContent {
        when {
            state.isLoading && state.detail == null -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.gold)
                }
            }
            state.error != null && state.detail == null -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(state.error ?: "Lỗi", color = palette.crimsonSoft)
                        Spacer(Modifier.height(10.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = palette.gold,
                            modifier = Modifier.clickable { viewModel.loadChannelDetail(channelName) }
                        ) {
                            Text("Thử lại", color = palette.obsidian, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                        }
                    }
                }
            }
            else -> {
                val detail = state.detail ?: return@CenteredContent
                val bannerUrl = PhimAiUtils.resolveServerUrl(serverUrl, detail.banner)
                val thumbUrl = PhimAiUtils.resolveServerUrl(serverUrl, detail.thumbnail)

                LazyVerticalGrid(
                    columns = rememberVideoGridCells(),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(gridHorizontalSpacing()),
                    verticalArrangement = Arrangement.spacedBy(gridVerticalSpacing())
                ) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(140.dp)
                                    .clip(RoundedCornerShape(CinemaRadius.container))
                                    .background(palette.slate)
                            ) {
                                if (bannerUrl.isNotBlank()) {
                                    AsyncImage(
                                        model = bannerUrl,
                                        contentDescription = detail.name,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize()
                                    )
                                }
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(
                                            Brush.verticalGradient(
                                                colors = listOf(Color.Black.copy(alpha = 0.25f), palette.obsidian.copy(alpha = 0.88f))
                                            )
                                        )
                                )
                                IconButton(
                                    onClick = onBack,
                                    modifier = Modifier
                                        .align(Alignment.TopStart)
                                        .statusBarsPadding()
                                        .padding(4.dp)
                                ) {
                                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Quay lại", tint = Color.White)
                                }
                            }

                            Spacer(Modifier.height(12.dp))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                if (thumbUrl.isNotBlank()) {
                                    AsyncImage(
                                        model = thumbUrl,
                                        contentDescription = detail.name,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .size(54.dp)
                                            .clip(RoundedCornerShape(27.dp))
                                            .background(palette.slateRaised)
                                    )
                                } else {
                                    ChannelInitialAvatar(name = detail.name, size = 54.dp)
                                }
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                                    ) {
                                        Text(
                                            text = detail.name,
                                            color = palette.ivory,
                                            fontSize = 18.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                        Icon(Icons.Filled.Verified, contentDescription = null, tint = palette.gold, modifier = Modifier.size(16.dp))
                                    }
                                    Text(
                                        text = "${detail.count} phim • ${PhimAiUtils.formatViewsVN(detail.totalViews.toString())} • ${detail.fullCount} trọn bộ",
                                        color = palette.textSecondary,
                                        fontSize = 12.5.sp
                                    )
                                }
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = if (state.isSubscribed) palette.slateRaised else palette.gold,
                                    border = BorderStroke(1.dp, if (state.isSubscribed) palette.border else palette.gold),
                                    modifier = Modifier.clickable {
                                        viewModel.toggleChannelSubscription(detail.name, thumbUrl, detail.count)
                                    }
                                ) {
                                    Text(
                                        text = if (state.isSubscribed) "Đã đăng ký" else "Đăng ký",
                                        color = if (state.isSubscribed) palette.ivory else palette.obsidian,
                                        fontSize = 12.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                                    )
                                }
                            }

                            Spacer(Modifier.height(10.dp))
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(listOf("newest" to "Mới nhất", "popular" to "Xem nhiều", "oldest" to "Cũ nhất")) { (id, label) ->
                                    val selected = state.sort == id
                                    Surface(
                                        shape = RoundedCornerShape(CinemaRadius.element),
                                        color = if (selected) palette.gold else palette.slateRaised,
                                        border = BorderStroke(1.dp, if (selected) palette.gold else palette.border),
                                        modifier = Modifier.clickable { viewModel.selectDetailSort(channelName, id) }
                                    ) {
                                        Text(
                                            text = label,
                                            color = if (selected) palette.obsidian else palette.ivory,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    items(state.displayFilms, key = { it.id }) { film ->
                        FilmCard(
                            film = film,
                            serverUrl = serverUrl,
                            isSaved = film.id in savedIds,
                            progressFraction = progressMap[film.id],
                            onFilmClick = { clicked -> onFilmClick(clicked.id) },
                            onToggleSave = { viewModel.toggleSaveFilm(it) },
                            onChannelClick = {}
                        )
                    }
                }
            }
        }
    }
}
