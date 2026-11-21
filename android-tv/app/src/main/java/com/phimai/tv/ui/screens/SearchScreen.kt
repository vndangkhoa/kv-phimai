package com.phimai.tv.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.foundation.lazy.grid.TvGridCells
import androidx.tv.foundation.lazy.grid.TvLazyVerticalGrid
import androidx.tv.foundation.lazy.grid.items
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.Border
import androidx.tv.material3.Button
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.phimai.tv.data.api.TvPhimAiApi
import com.phimai.tv.ui.components.PhimAiTvFilmCard
import com.phimai.tv.ui.theme.TvCinema
import com.phimai.tv.viewmodel.SearchViewModel

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SearchScreen(
    onFilmClick: (String) -> Unit,
    vm: SearchViewModel = viewModel()
) {
    val query by vm.query.collectAsState()
    val results by vm.results.collectAsState()
    val loading by vm.loading.collectAsState()
    val serverUrl by TvPhimAiApi.serverFlow.collectAsState()

    val presets = listOf("Tu tiên", "Hoạt hình 3D", "Xuyên không", "Trọn bộ", "Ngôn tình", "Sử Việt", "Viễn tưởng", "Kinh dị")

    Column(
        Modifier
            .fillMaxSize()
            .background(TvCinema.Obsidian)
            .padding(top = 20.dp)
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { vm.setQuery(it) },
                placeholder = { Text("Nhập tên phim, kênh, thể loại...", color = TvCinema.TextMuted) },
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = TvCinema.Gold,
                    unfocusedBorderColor = TvCinema.Border,
                    focusedTextColor = TvCinema.Ivory,
                    unfocusedTextColor = TvCinema.Ivory,
                    focusedContainerColor = TvCinema.Slate,
                    unfocusedContainerColor = TvCinema.Slate
                ),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { vm.executeSearch() }),
                modifier = Modifier.weight(1f)
            )
            Button(onClick = { vm.executeSearch() }) {
                Text("Tìm kiếm", fontWeight = FontWeight.Bold)
            }
        }

        TvLazyRow(
            contentPadding = PaddingValues(horizontal = 32.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(presets) { tag ->
                Surface(
                    onClick = { vm.executeSearch(tag) },
                    shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(8.dp)),
                    colors = ClickableSurfaceDefaults.colors(
                        containerColor = TvCinema.SlateRaised,
                        focusedContainerColor = TvCinema.Gold,
                        contentColor = TvCinema.Ivory,
                        focusedContentColor = TvCinema.Obsidian
                    ),
                    border = ClickableSurfaceDefaults.border(
                        border = Border(BorderStroke(1.dp, TvCinema.Border)),
                        focusedBorder = Border(BorderStroke(2.dp, TvCinema.Gold))
                    )
                ) {
                    Text(tag, fontSize = 12.5.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp))
                }
            }
        }

        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = TvCinema.Gold)
            }
        } else {
            TvLazyVerticalGrid(
                columns = TvGridCells.Fixed(3),
                contentPadding = PaddingValues(horizontal = 32.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                items(results, key = { it.id }) { film ->
                    PhimAiTvFilmCard(film = film, serverUrl = serverUrl, onClick = { onFilmClick(film.id) })
                }
            }
        }
    }
}
