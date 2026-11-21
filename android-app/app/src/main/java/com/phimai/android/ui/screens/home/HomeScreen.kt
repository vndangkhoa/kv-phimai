package com.phimai.android.ui.screens.home

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
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.phimai.android.data.util.PhimAiUtils
import com.phimai.android.ui.components.CenteredContent
import com.phimai.android.ui.components.FilmCard
import com.phimai.android.ui.components.gridHorizontalSpacing
import com.phimai.android.ui.components.gridVerticalSpacing
import com.phimai.android.ui.components.rememberVideoGridCells
import com.phimai.android.ui.navigation.Screen
import com.phimai.android.ui.navigation.TabReselect
import com.phimai.android.ui.theme.CinemaRadius
import com.phimai.android.ui.theme.cinema

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onFilmClick: (String) -> Unit,
    onChannelClick: (String) -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val palette = cinema
    val state by viewModel.uiState.collectAsState()
    val serverUrl by viewModel.serverUrl.collectAsState()
    val savedIds by viewModel.savedIds.collectAsState()
    val progressMap by viewModel.progressMap.collectAsState()
    val gridState = rememberLazyGridState()

    LaunchedEffect(Unit) {
        TabReselect.events.collect { route ->
            if (route == Screen.Home.route) {
                gridState.animateScrollToItem(0)
                viewModel.loadInitial(refresh = true)
            }
        }
    }

    val shouldLoadMore by remember {
        derivedStateOf {
            val layout = gridState.layoutInfo
            val total = layout.totalItemsCount
            val lastVisible = layout.visibleItemsInfo.lastOrNull()?.index ?: 0
            total > 0 && lastVisible >= total - 8
        }
    }
    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) viewModel.loadMore()
    }

    CenteredContent {
        Column(modifier = Modifier.fillMaxSize()) {
            // Category filter chips
            LazyRow(
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(PhimAiUtils.CAT_ORDER) { cat ->
                    val selected = state.selectedCat == cat
                    val count = state.catCounts[cat]
                    val label = PhimAiUtils.CAT_LABEL[cat] ?: cat
                    Surface(
                        shape = RoundedCornerShape(CinemaRadius.element),
                        color = if (selected) palette.gold else palette.slateRaised,
                        border = BorderStroke(
                            1.dp,
                            if (selected) palette.gold else palette.border
                        ),
                        modifier = Modifier.clickable { viewModel.selectCategory(cat) }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp)
                        ) {
                            Text(
                                text = label,
                                color = if (selected) palette.obsidian else palette.ivory,
                                fontSize = 12.5.sp,
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium
                            )
                            if (count != null && count > 0) {
                                Text(
                                    text = "$count",
                                    color = if (selected) palette.obsidian.copy(alpha = 0.72f) else palette.textMuted,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                }
            }

            // Sort pills + Trọn bộ FULL toggle
            LazyRow(
                contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                item {
                    Surface(
                        shape = RoundedCornerShape(CinemaRadius.element),
                        color = if (state.fullOnly) palette.crimsonMuted else palette.slate,
                        border = BorderStroke(
                            1.dp,
                            if (state.fullOnly) palette.crimson else palette.border
                        ),
                        modifier = Modifier.clickable { viewModel.toggleFullOnly() }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.CheckCircle,
                                contentDescription = null,
                                tint = if (state.fullOnly) palette.crimsonSoft else palette.textMuted,
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                text = "Trọn bộ FULL",
                                color = if (state.fullOnly) palette.crimsonSoft else palette.textSecondary,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
                items(PhimAiUtils.SORT_OPTIONS) { sortOpt ->
                    val selected = state.selectedSort == sortOpt.id
                    Surface(
                        shape = RoundedCornerShape(CinemaRadius.element),
                        color = if (selected) palette.goldMuted else palette.slate,
                        border = BorderStroke(
                            1.dp,
                            if (selected) palette.gold.copy(alpha = 0.55f) else palette.border
                        ),
                        modifier = Modifier.clickable { viewModel.selectSort(sortOpt.id) }
                    ) {
                        Text(
                            text = sortOpt.label,
                            color = if (selected) palette.gold else palette.textSecondary,
                            fontSize = 12.sp,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }
                }
            }

            PullToRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = { viewModel.loadInitial(refresh = true) },
                modifier = Modifier.weight(1f)
            ) {
                when {
                    state.isLoading && state.displayFilms.isEmpty() -> {
                        LazyVerticalGrid(
                            columns = rememberVideoGridCells(),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(gridHorizontalSpacing()),
                            verticalArrangement = Arrangement.spacedBy(gridVerticalSpacing())
                        ) {
                            items(8) {
                                Column {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .aspectRatio(16f / 9f)
                                            .clip(RoundedCornerShape(CinemaRadius.container))
                                            .background(palette.slateRaised)
                                    )
                                    Spacer(modifier = Modifier.height(10.dp))
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth(0.85f)
                                            .height(16.dp)
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(palette.slateRaised)
                                    )
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth(0.5f)
                                            .height(12.dp)
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(palette.slate)
                                    )
                                }
                            }
                        }
                    }

                    state.error != null && state.displayFilms.isEmpty() -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.padding(24.dp)
                            ) {
                                Text(
                                    text = state.error ?: "Lỗi kết nối máy chủ",
                                    color = palette.crimsonSoft,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Medium
                                )
                                Spacer(modifier = Modifier.height(12.dp))
                                Button(
                                    onClick = { viewModel.loadInitial() },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = palette.gold,
                                        contentColor = palette.obsidian
                                    )
                                ) {
                                    Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Thử lại", fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }

                    state.displayFilms.isEmpty() -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "Không tìm thấy phim AI phù hợp",
                                color = palette.textMuted,
                                fontSize = 14.sp
                            )
                        }
                    }

                    else -> {
                        LazyVerticalGrid(
                            state = gridState,
                            columns = rememberVideoGridCells(),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(gridHorizontalSpacing()),
                            verticalArrangement = Arrangement.spacedBy(gridVerticalSpacing())
                        ) {
                            items(state.displayFilms, key = { it.id }) { film ->
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
                            if (state.isLoadingMore) {
                                item(span = { GridItemSpan(maxLineSpan) }) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(16.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        CircularProgressIndicator(
                                            color = palette.gold,
                                            strokeWidth = 2.5.dp,
                                            modifier = Modifier.size(28.dp)
                                        )
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
