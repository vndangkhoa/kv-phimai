package com.phimai.tv.ui.screens

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.tv.material3.Border
import androidx.tv.material3.Button
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.phimai.tv.data.util.TvPhimAiUtils
import com.phimai.tv.ui.components.PhimAiTvCategoryRow
import com.phimai.tv.ui.components.PhimAiTvHeroRow
import com.phimai.tv.ui.theme.TvCinema
import com.phimai.tv.viewmodel.HomeViewModel

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun HomeScreen(
    onFilmClick: (String) -> Unit,
    vm: HomeViewModel = viewModel()
) {
    val state by vm.state.collectAsState()
    val serverUrl by vm.serverUrl.collectAsState()
    val continueWatching by vm.continueWatching.collectAsState()
    val progressMap by vm.progressMap.collectAsState()

    TvLazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 12.dp, bottom = 12.dp),
        contentPadding = PaddingValues(bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            TvLazyRow(
                contentPadding = PaddingValues(horizontal = 32.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(TvPhimAiUtils.TV_CATEGORIES) { (id, label) ->
                    val selected = state.selectedCat == id
                    Surface(
                        onClick = { vm.selectCategory(id) },
                        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(10.dp)),
                        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.06f),
                        colors = ClickableSurfaceDefaults.colors(
                            containerColor = if (selected) TvCinema.Gold else TvCinema.SlateRaised,
                            focusedContainerColor = TvCinema.Gold,
                            contentColor = if (selected) TvCinema.Obsidian else TvCinema.Ivory,
                            focusedContentColor = TvCinema.Obsidian
                        ),
                        border = ClickableSurfaceDefaults.border(
                            border = Border(BorderStroke(1.dp, if (selected) TvCinema.Gold else TvCinema.Border)),
                            focusedBorder = Border(BorderStroke(2.dp, TvCinema.Gold))
                        )
                    ) {
                        Text(
                            text = label,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                        )
                    }
                }
            }
        }

        state.error?.let { err ->
            item {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(err, color = TvCinema.CrimsonSoft)
                    Button(onClick = { vm.refresh() }) { Text("Thử lại") }
                }
            }
        }

        if (state.selectedCat != "all") {
            val catTitle = TvPhimAiUtils.TV_CATEGORIES.firstOrNull { it.first == state.selectedCat }?.second ?: state.selectedCat
            if (state.filtered.isEmpty() && !state.isLoading) {
                item {
                    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        Text("Chưa có phim nào trong $catTitle", color = TvCinema.TextMuted)
                    }
                }
            } else {
                val chunks = state.filtered.chunked(6)
                for ((idx, chunk) in chunks.withIndex()) {
                    item(key = "cat_chunk_${state.selectedCat}_$idx") {
                        PhimAiTvCategoryRow(
                            title = if (idx == 0) catTitle else "",
                            films = chunk,
                            serverUrl = serverUrl,
                            progressMap = progressMap,
                            onFilmClick = { onFilmClick(it.id) }
                        )
                    }
                }
            }
        } else {
            if (state.hero.isNotEmpty()) {
                item(key = "hero_row") {
                    PhimAiTvHeroRow(
                        title = "Đề xuất nổi bật • PhimAI 4K",
                        films = state.hero,
                        serverUrl = serverUrl,
                        onFilmClick = { onFilmClick(it.id) }
                    )
                }
            }
            if (continueWatching.isNotEmpty()) {
                item(key = "continue_row") {
                    PhimAiTvCategoryRow(
                        title = "Tiếp tục xem",
                        films = continueWatching,
                        serverUrl = serverUrl,
                        progressMap = progressMap,
                        onFilmClick = { onFilmClick(it.id) }
                    )
                }
            }
            state.rows.forEach { (title, list) ->
                item(key = "row_$title") {
                    PhimAiTvCategoryRow(
                        title = title,
                        films = list,
                        serverUrl = serverUrl,
                        progressMap = progressMap,
                        onFilmClick = { onFilmClick(it.id) }
                    )
                }
            }
        }
    }
}
