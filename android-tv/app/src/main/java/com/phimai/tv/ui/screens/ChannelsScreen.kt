package com.phimai.tv.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.foundation.lazy.grid.TvGridCells
import androidx.tv.foundation.lazy.grid.TvLazyVerticalGrid
import androidx.tv.foundation.lazy.grid.items
import androidx.tv.material3.Border
import androidx.tv.material3.Button
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.phimai.tv.data.api.TvPhimAiApi
import com.phimai.tv.data.util.TvPhimAiUtils
import com.phimai.tv.ui.components.PhimAiTvFilmCard
import com.phimai.tv.ui.theme.TvCinema
import com.phimai.tv.viewmodel.ChannelsViewModel

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ChannelsScreen(
    onChannelClick: (String) -> Unit,
    vm: ChannelsViewModel = viewModel()
) {
    val channels by vm.channels.collectAsState()
    val loading by vm.loading.collectAsState()
    val serverUrl by TvPhimAiApi.serverFlow.collectAsState()

    Column(Modifier.fillMaxSize().padding(top = 20.dp)) {
        Text(
            text = "Kênh Phim AI & Studio",
            color = TvCinema.Gold,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 32.dp, vertical = 8.dp)
        )
        if (loading && channels.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = TvCinema.Gold)
            }
        } else {
            TvLazyVerticalGrid(
                columns = TvGridCells.Fixed(3),
                contentPadding = PaddingValues(horizontal = 32.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(channels, key = { it.name }) { ch ->
                    val thumb = TvPhimAiUtils.resolveServerUrl(serverUrl, ch.thumbnail)
                    Card(
                        onClick = { onChannelClick(ch.name) },
                        shape = CardDefaults.shape(RoundedCornerShape(12.dp)),
                        scale = CardDefaults.scale(focusedScale = 1.05f),
                        border = CardDefaults.border(focusedBorder = Border(BorderStroke(2.dp, TvCinema.Gold))),
                        colors = CardDefaults.colors(containerColor = TvCinema.Slate, focusedContainerColor = TvCinema.SlateRaised)
                    ) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                if (thumb.isNotBlank()) {
                                    AsyncImage(
                                        model = thumb,
                                        contentDescription = ch.name,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.size(42.dp).clip(CircleShape).background(TvCinema.SlateRaised)
                                    )
                                } else {
                                    Box(
                                        Modifier.size(42.dp).clip(CircleShape).background(TvCinema.SlateRaised),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(ch.name.take(1).uppercase(), color = TvCinema.Gold, fontWeight = FontWeight.Bold)
                                    }
                                }
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(ch.name, color = TvCinema.Ivory, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, false))
                                        Icon(Icons.Filled.Verified, contentDescription = null, tint = TvCinema.Gold, modifier = Modifier.size(14.dp))
                                    }
                                    Text("${ch.count} phim • ${TvPhimAiUtils.formatViewsVN(ch.totalViews.toString())}", color = TvCinema.TextMuted, fontSize = 11.5.sp)
                                }
                            }
                            if (ch.previewFilms.isNotEmpty()) {
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                                    ch.previewFilms.take(2).forEach { pf ->
                                        AsyncImage(
                                            model = TvPhimAiUtils.thumbUrl(serverUrl, pf.id),
                                            contentDescription = pf.title,
                                            contentScale = ContentScale.Crop,
                                            modifier = Modifier.weight(1f).aspectRatio(16f / 9f).clip(RoundedCornerShape(6.dp))
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

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ChannelDetailScreen(
    channelName: String,
    onFilmClick: (String) -> Unit,
    vm: ChannelsViewModel = viewModel()
) {
    val detail by vm.channelDetail.collectAsState()
    val loading by vm.loading.collectAsState()
    val subscribed by vm.subscribed.collectAsState()
    val serverUrl by TvPhimAiApi.serverFlow.collectAsState()

    LaunchedEffect(channelName) { vm.loadChannel(channelName) }

    if (loading && detail == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = TvCinema.Gold)
        }
        return
    }

    val d = detail ?: return
    val isSub = subscribed.any { it.equals(d.name, ignoreCase = true) }
    val stacked = TvPhimAiUtils.stackSeriesForGrid(d.films)

    Column(Modifier.fillMaxSize().padding(top = 20.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(d.name, color = TvCinema.Ivory, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text("${d.count} phim • ${TvPhimAiUtils.formatViewsVN(d.totalViews.toString())}", color = TvCinema.TextSecondary, fontSize = 13.sp)
            }
            Button(onClick = { vm.toggleSubscribe(d.name) }) {
                Text(if (isSub) "Đã đăng ký" else "Đăng ký kênh")
            }
        }
        TvLazyVerticalGrid(
            columns = TvGridCells.Fixed(3),
            contentPadding = PaddingValues(horizontal = 32.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            items(stacked, key = { it.id }) { film ->
                PhimAiTvFilmCard(film = film, serverUrl = serverUrl, onClick = { onFilmClick(film.id) })
            }
        }
    }
}
