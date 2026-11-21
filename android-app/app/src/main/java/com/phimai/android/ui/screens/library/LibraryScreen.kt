package com.phimai.android.ui.screens.library

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.phimai.android.ui.components.CenteredContent
import com.phimai.android.ui.components.ChannelInitialAvatar
import com.phimai.android.ui.components.FilmCard
import com.phimai.android.ui.components.gridHorizontalSpacing
import com.phimai.android.ui.components.gridVerticalSpacing
import com.phimai.android.ui.components.rememberChannelGridCells
import com.phimai.android.ui.components.rememberVideoGridCells
import com.phimai.android.ui.theme.CinemaRadius
import com.phimai.android.ui.theme.cinema

@Composable
fun LibraryScreen(
    onFilmClick: (String) -> Unit,
    onChannelClick: (String) -> Unit,
    viewModel: LibraryViewModel = hiltViewModel()
) {
    val palette = cinema
    val serverUrl by viewModel.serverUrl.collectAsState()
    val saved by viewModel.savedFilms.collectAsState()
    val history by viewModel.history.collectAsState()
    val subs by viewModel.subscriptions.collectAsState()
    val savedIds by viewModel.savedIds.collectAsState()
    val progressMap by viewModel.progressMap.collectAsState()
    var tabIndex by rememberSaveable { mutableIntStateOf(0) }

    CenteredContent {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                listOf(
                    Triple(0, "Xem sau (${saved.size})", Icons.Filled.Bookmark),
                    Triple(1, "Lịch sử (${history.size})", Icons.Filled.History),
                    Triple(2, "Kênh (${subs.size})", Icons.Filled.Tv)
                ).forEach { (idx, label, icon) ->
                    val selected = tabIndex == idx
                    Surface(
                        shape = RoundedCornerShape(CinemaRadius.element),
                        color = if (selected) palette.gold else palette.slateRaised,
                        border = BorderStroke(1.dp, if (selected) palette.gold else palette.border),
                        modifier = Modifier.clickable { tabIndex = idx }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 11.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp)
                        ) {
                            Icon(
                                icon,
                                contentDescription = null,
                                tint = if (selected) palette.obsidian else palette.ivory,
                                modifier = Modifier.size(15.dp)
                            )
                            Text(
                                text = label,
                                color = if (selected) palette.obsidian else palette.ivory,
                                fontSize = 12.sp,
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium
                            )
                        }
                    }
                }
            }

            when (tabIndex) {
                0 -> {
                    if (saved.isEmpty()) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("Chưa có phim nào trong Xem sau", color = palette.textMuted)
                        }
                    } else {
                        LazyVerticalGrid(
                            columns = rememberVideoGridCells(),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(gridHorizontalSpacing()),
                            verticalArrangement = Arrangement.spacedBy(gridVerticalSpacing())
                        ) {
                            items(saved, key = { it.filmId }) { entry ->
                                val film = entry.toFilm()
                                FilmCard(
                                    film = film,
                                    serverUrl = serverUrl,
                                    isSaved = film.id in savedIds,
                                    progressFraction = progressMap[film.id],
                                    onFilmClick = { onFilmClick(film.id) },
                                    onToggleSave = { viewModel.toggleSave(it) },
                                    onChannelClick = onChannelClick
                                )
                            }
                        }
                    }
                }
                1 -> {
                    if (history.isEmpty()) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("Chưa có lịch sử xem", color = palette.textMuted)
                        }
                    } else {
                        Column(Modifier.fillMaxSize()) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp),
                                horizontalArrangement = Arrangement.End
                            ) {
                                TextButton(onClick = { viewModel.clearHistory() }) {
                                    Icon(Icons.Filled.DeleteOutline, contentDescription = null, tint = palette.crimsonSoft, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Xóa lịch sử", color = palette.crimsonSoft, fontSize = 12.sp)
                                }
                            }
                            LazyVerticalGrid(
                                columns = rememberVideoGridCells(),
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp),
                                horizontalArrangement = Arrangement.spacedBy(gridHorizontalSpacing()),
                                verticalArrangement = Arrangement.spacedBy(gridVerticalSpacing())
                            ) {
                                items(history, key = { it.filmId }) { entry ->
                                    val film = entry.toFilm()
                                    FilmCard(
                                        film = film,
                                        serverUrl = serverUrl,
                                        isSaved = film.id in savedIds,
                                        progressFraction = progressMap[film.id],
                                        onFilmClick = { onFilmClick(film.id) },
                                        onToggleSave = { viewModel.toggleSave(it) },
                                        onChannelClick = onChannelClick
                                    )
                                }
                            }
                        }
                    }
                }
                else -> {
                    if (subs.isEmpty()) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("Chưa đăng ký kênh nào", color = palette.textMuted)
                        }
                    } else {
                        LazyVerticalGrid(
                            columns = rememberChannelGridCells(),
                            contentPadding = PaddingValues(14.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(subs, key = { it.name }) { sub ->
                                Surface(
                                    shape = RoundedCornerShape(CinemaRadius.container),
                                    color = palette.slate,
                                    border = BorderStroke(1.dp, palette.border),
                                    modifier = Modifier.clickable { onChannelClick(sub.name) }
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(14.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        ChannelInitialAvatar(name = sub.name, size = 44.dp)
                                        Spacer(Modifier.width(12.dp))
                                        Column(Modifier.weight(1f)) {
                                            Text(sub.name, color = palette.ivory, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                            if (sub.filmCount > 0) {
                                                Text("${sub.filmCount} phim AI", color = palette.textSecondary, fontSize = 12.sp)
                                            }
                                        }
                                        TextButton(onClick = { viewModel.unsubscribe(sub.name) }) {
                                            Text("Bỏ đăng ký", color = palette.textMuted, fontSize = 12.sp)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
