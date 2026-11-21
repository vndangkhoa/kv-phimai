package com.phimai.tv.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.phimai.tv.data.api.TvPhimAiApi
import com.phimai.tv.ui.components.PhimAiTvCategoryRow
import com.phimai.tv.ui.components.PhimAiTvHeroRow
import com.phimai.tv.ui.theme.TvCinema
import com.phimai.tv.viewmodel.TrendingViewModel

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TrendingScreen(
    onFilmClick: (String) -> Unit,
    vm: TrendingViewModel = viewModel()
) {
    val topWeek by vm.topWeek.collectAsState()
    val hot by vm.hot.collectAsState()
    val mostViewed by vm.mostViewed.collectAsState()
    val loading by vm.loading.collectAsState()
    val serverUrl by TvPhimAiApi.serverFlow.collectAsState()

    if (loading && hot.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = TvCinema.Gold)
        }
        return
    }

    TvLazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 20.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            Text(
                text = "Bảng Xếp Hạng & Thịnh Hành",
                color = TvCinema.Gold,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 32.dp, vertical = 4.dp)
            )
        }
        if (topWeek.isNotEmpty()) {
            item {
                PhimAiTvHeroRow(
                    title = "Top Tuần PhimAI",
                    films = topWeek.map { it.film },
                    serverUrl = serverUrl,
                    onFilmClick = { onFilmClick(it.id) }
                )
            }
        }
        if (hot.isNotEmpty()) {
            item {
                PhimAiTvCategoryRow(
                    title = "Đang hot hôm nay",
                    films = hot,
                    serverUrl = serverUrl,
                    onFilmClick = { onFilmClick(it.id) }
                )
            }
        }
        if (mostViewed.isNotEmpty()) {
            item {
                PhimAiTvCategoryRow(
                    title = "Xem nhiều nhất",
                    films = mostViewed,
                    serverUrl = serverUrl,
                    onFilmClick = { onFilmClick(it.id) }
                )
            }
        }
    }
}
