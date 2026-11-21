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
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import com.phimai.android.ui.components.ChannelInitialAvatar
import com.phimai.android.ui.components.rememberChannelGridCells
import com.phimai.android.ui.theme.CinemaRadius
import com.phimai.android.ui.theme.cinema

@Composable
fun ChannelsDirectoryScreen(
    onChannelClick: (String) -> Unit,
    onFilmClick: (String) -> Unit,
    viewModel: ChannelsViewModel = hiltViewModel()
) {
    val palette = cinema
    val state by viewModel.dirState.collectAsState()
    val serverUrl by viewModel.serverUrl.collectAsState()
    val subscribed by viewModel.subscribedNames.collectAsState()

    CenteredContent {
        Column(modifier = Modifier.fillMaxSize()) {
            OutlinedTextField(
                value = state.query,
                onValueChange = { viewModel.onDirectoryQueryChange(it) },
                placeholder = { Text("Tìm kênh AI studio, nhóm review...", color = palette.textMuted, fontSize = 13.5.sp) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = palette.textMuted) },
                singleLine = true,
                shape = RoundedCornerShape(CinemaRadius.container),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = palette.slate,
                    unfocusedContainerColor = palette.slate,
                    focusedBorderColor = palette.gold,
                    unfocusedBorderColor = palette.border,
                    focusedTextColor = palette.ivory,
                    unfocusedTextColor = palette.ivory
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 8.dp)
            )

            LazyRow(
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(
                    listOf("popular" to "Phổ biến", "count" to "Nhiều phim", "name" to "A–Z")
                ) { (id, label) ->
                    val selected = state.sort == id
                    Surface(
                        shape = RoundedCornerShape(CinemaRadius.element),
                        color = if (selected) palette.gold else palette.slateRaised,
                        border = BorderStroke(1.dp, if (selected) palette.gold else palette.border),
                        modifier = Modifier.clickable { viewModel.selectDirectorySort(id) }
                    ) {
                        Text(
                            text = label,
                            color = if (selected) palette.obsidian else palette.ivory,
                            fontSize = 12.sp,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                        )
                    }
                }
            }

            when {
                state.isLoading && state.channels.isEmpty() -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = palette.gold)
                    }
                }
                state.error != null && state.channels.isEmpty() -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(state.error ?: "Lỗi", color = palette.crimsonSoft)
                            Spacer(Modifier.height(10.dp))
                            Button(
                                onClick = { viewModel.loadChannels() },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = palette.gold,
                                    contentColor = palette.obsidian
                                )
                            ) { Text("Thử lại", fontWeight = FontWeight.Bold) }
                        }
                    }
                }
                else -> {
                    LazyVerticalGrid(
                        columns = rememberChannelGridCells(),
                        contentPadding = PaddingValues(14.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(state.channels, key = { it.name }) { ch ->
                            val isSub = ch.name.lowercase() in subscribed
                            val thumb = PhimAiUtils.resolveServerUrl(serverUrl, ch.thumbnail)
                            Surface(
                                shape = RoundedCornerShape(CinemaRadius.container),
                                color = palette.slate,
                                border = BorderStroke(1.dp, palette.border),
                                modifier = Modifier.clickable { onChannelClick(ch.name) }
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        if (thumb.isNotBlank()) {
                                            AsyncImage(
                                                model = thumb,
                                                contentDescription = ch.name,
                                                contentScale = ContentScale.Crop,
                                                modifier = Modifier
                                                    .size(44.dp)
                                                    .clip(RoundedCornerShape(22.dp))
                                                    .background(palette.slateRaised)
                                            )
                                        } else {
                                            ChannelInitialAvatar(name = ch.name, size = 44.dp)
                                        }
                                        Spacer(Modifier.width(10.dp))
                                        Column(Modifier.weight(1f)) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                                            ) {
                                                Text(
                                                    text = ch.name,
                                                    color = palette.ivory,
                                                    fontSize = 14.5.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                    modifier = Modifier.weight(1f, fill = false)
                                                )
                                                Icon(
                                                    Icons.Filled.Verified,
                                                    contentDescription = null,
                                                    tint = palette.gold,
                                                    modifier = Modifier.size(14.dp)
                                                )
                                            }
                                            Text(
                                                text = "${ch.count} phim • ${PhimAiUtils.formatViewsVN(ch.totalViews.toString())}",
                                                color = palette.textMuted,
                                                fontSize = 11.5.sp,
                                                maxLines = 1
                                            )
                                        }
                                        Surface(
                                            shape = RoundedCornerShape(8.dp),
                                            color = if (isSub) palette.slateRaised else palette.gold,
                                            border = BorderStroke(1.dp, if (isSub) palette.border else palette.gold),
                                            modifier = Modifier.clickable {
                                                viewModel.toggleChannelSubscription(ch.name, thumb, ch.count)
                                            }
                                        ) {
                                            Text(
                                                text = if (isSub) "Đã đăng ký" else "Đăng ký",
                                                color = if (isSub) palette.textSecondary else palette.obsidian,
                                                fontSize = 11.5.sp,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                                            )
                                        }
                                    }

                                    if (ch.previewFilms.isNotEmpty()) {
                                        Spacer(Modifier.height(10.dp))
                                        Row(
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            ch.previewFilms.take(3).forEach { pf ->
                                                val pThumb = PhimAiUtils.thumbUrl(serverUrl, pf.id)
                                                AsyncImage(
                                                    model = pThumb,
                                                    contentDescription = pf.title,
                                                    contentScale = ContentScale.Crop,
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .aspectRatio(16f / 9f)
                                                        .clip(RoundedCornerShape(6.dp))
                                                        .background(palette.slateRaised)
                                                        .clickable { onFilmClick(pf.id) }
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
    }
}
