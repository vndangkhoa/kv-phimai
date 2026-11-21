package com.phimai.tv.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.Button
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.phimai.tv.data.api.TvPhimAiApi
import com.phimai.tv.ui.components.PhimAiTvCategoryRow
import com.phimai.tv.ui.theme.TvCinema
import com.phimai.tv.viewmodel.LibraryViewModel

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun LibraryScreen(
    onFilmClick: (String) -> Unit,
    onChannelClick: (String) -> Unit,
    vm: LibraryViewModel = viewModel()
) {
    val history by vm.history.collectAsState()
    val saved by vm.saved.collectAsState()
    val subs by vm.subs.collectAsState()
    val serverUrl by TvPhimAiApi.serverFlow.collectAsState()

    val progressMap = history.mapNotNull { h ->
        if (h.durationMs > 0L && h.positionMs > 5_000L) {
            val p = (h.positionMs.toFloat() / h.durationMs.toFloat()).coerceIn(0f, 1f)
            if (p in 0.03f..0.97f) h.film.id to p else null
        } else null
    }.toMap()

    if (history.isEmpty() && saved.isEmpty() && subs.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Thư viện trống — hãy xem hoặc lưu vài bộ phim yêu thích!", color = TvCinema.TextMuted, fontSize = 15.sp)
        }
        return
    }

    TvLazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 20.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        if (history.isNotEmpty()) {
            item {
                PhimAiTvCategoryRow(
                    title = "Lịch sử đã xem (${history.size})",
                    films = history.map { it.film },
                    serverUrl = serverUrl,
                    progressMap = progressMap,
                    onFilmClick = { onFilmClick(it.id) }
                )
            }
        }
        if (saved.isNotEmpty()) {
            item {
                PhimAiTvCategoryRow(
                    title = "Xem sau (${saved.size})",
                    films = saved,
                    serverUrl = serverUrl,
                    progressMap = progressMap,
                    onFilmClick = { onFilmClick(it.id) }
                )
            }
        }
        if (subs.isNotEmpty()) {
            item {
                Text(
                    text = "Kênh đã đăng ký",
                    color = TvCinema.Gold,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 32.dp, bottom = 8.dp)
                )
                TvLazyRow(
                    contentPadding = PaddingValues(horizontal = 32.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(subs) { chName ->
                        Button(onClick = { onChannelClick(chName) }) {
                            Text(chName)
                        }
                    }
                }
            }
        }
    }
}
