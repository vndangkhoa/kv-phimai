package com.phimai.android.ui.screens.hot

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.phimai.android.data.util.PhimAiUtils
import com.phimai.android.ui.components.CenteredContent
import com.phimai.android.ui.components.FilmCard
import com.phimai.android.ui.components.gridHorizontalSpacing
import com.phimai.android.ui.components.gridVerticalSpacing
import com.phimai.android.ui.components.rememberVideoGridCells
import com.phimai.android.ui.theme.CinemaRadius
import com.phimai.android.ui.theme.cinema

@Composable
fun HotScreen(
    onFilmClick: (String) -> Unit,
    onChannelClick: (String) -> Unit,
    viewModel: HotViewModel = hiltViewModel()
) {
    val palette = cinema
    val state by viewModel.uiState.collectAsState()
    val serverUrl by viewModel.serverUrl.collectAsState()
    val savedIds by viewModel.savedIds.collectAsState()
    val progressMap by viewModel.progressMap.collectAsState()

    CenteredContent {
        when {
            state.isLoading && state.hotFilms.isEmpty() -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.gold)
                }
            }
            state.error != null && state.hotFilms.isEmpty() -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(state.error ?: "Lỗi", color = palette.crimsonSoft)
                        Spacer(Modifier.height(10.dp))
                        Button(
                            onClick = { viewModel.refresh() },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = palette.gold,
                                contentColor = palette.obsidian
                            )
                        ) {
                            Text("Thử lại", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            else -> {
                LazyVerticalGrid(
                    columns = rememberVideoGridCells(),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(gridHorizontalSpacing()),
                    verticalArrangement = Arrangement.spacedBy(gridVerticalSpacing())
                ) {
                    if (state.topWeek.isNotEmpty()) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            Column {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        Icons.Filled.LocalFireDepartment,
                                        contentDescription = null,
                                        tint = palette.crimson,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Text(
                                        text = "Bảng Xếp Hạng Tuần",
                                        color = palette.ivory,
                                        fontSize = 17.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Spacer(Modifier.height(10.dp))
                                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    itemsIndexed(state.topWeek) { idx, entry ->
                                        val film = entry.film
                                        val thumb = PhimAiUtils.resolveServerUrl(
                                            serverUrl,
                                            film.thumbnailUrl.ifBlank { PhimAiUtils.thumbUrl(serverUrl, film.id) }
                                        )
                                        Surface(
                                            shape = RoundedCornerShape(CinemaRadius.container),
                                            color = palette.slate,
                                            border = BorderStroke(1.dp, palette.border),
                                            modifier = Modifier
                                                .width(220.dp)
                                                .clickable { onFilmClick(film.id) }
                                        ) {
                                            Column {
                                                Box(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .aspectRatio(16f / 9f)
                                                ) {
                                                    AsyncImage(
                                                        model = thumb,
                                                        contentDescription = film.title,
                                                        contentScale = ContentScale.Crop,
                                                        modifier = Modifier.fillMaxSize()
                                                    )
                                                    Box(
                                                        modifier = Modifier
                                                            .padding(6.dp)
                                                            .clip(RoundedCornerShape(6.dp))
                                                            .background(if (idx < 3) palette.gold else palette.obsidian.copy(alpha = 0.85f))
                                                            .padding(horizontal = 7.dp, vertical = 2.dp)
                                                    ) {
                                                        Text(
                                                            text = "#${idx + 1}",
                                                            color = if (idx < 3) palette.obsidian else palette.gold,
                                                            fontSize = 12.sp,
                                                            fontWeight = FontWeight.Bold
                                                        )
                                                    }
                                                }
                                                Column(Modifier.padding(10.dp)) {
                                                    Text(
                                                        text = film.title,
                                                        color = palette.ivory,
                                                        fontSize = 13.sp,
                                                        fontWeight = FontWeight.SemiBold,
                                                        maxLines = 2,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                    Spacer(Modifier.height(4.dp))
                                                    Text(
                                                        text = film.channel,
                                                        color = palette.textSecondary,
                                                        fontSize = 11.5.sp,
                                                        maxLines = 1
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                                Spacer(Modifier.height(8.dp))
                            }
                        }
                    }

                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Text(
                            text = "Đang Thịnh Hành Trên PhimAI",
                            color = palette.ivory,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }

                    items(state.hotFilms, key = { it.id }) { film ->
                        FilmCard(
                            film = film,
                            serverUrl = serverUrl,
                            isSaved = film.id in savedIds,
                            progressFraction = progressMap[film.id],
                            onFilmClick = { clicked -> onFilmClick(clicked.id) },
                            onToggleSave = { viewModel.toggleSave(it) },
                            onChannelClick = onChannelClick
                        )
                    }
                }
            }
        }
    }
}
