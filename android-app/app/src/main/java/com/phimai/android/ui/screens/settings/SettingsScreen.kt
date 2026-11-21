package com.phimai.android.ui.screens.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.phimai.android.BuildConfig
import com.phimai.android.data.model.QualityTier
import com.phimai.android.data.util.PhimAiUtils
import com.phimai.android.ui.components.MaxReadableWidthDp
import com.phimai.android.ui.theme.CinemaRadius
import com.phimai.android.ui.theme.cinema

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val palette = cinema
    val serverUrl by viewModel.serverUrl.collectAsState()
    val defaultQuality by viewModel.defaultQuality.collectAsState()
    val autoPlayNext by viewModel.autoPlayNext.collectAsState()
    val stackSeries by viewModel.stackSeries.collectAsState()
    val healthState by viewModel.healthState.collectAsState()
    val updateState by viewModel.updateState.collectAsState()

    var draftUrl by remember(serverUrl) { mutableStateOf(serverUrl) }

    LaunchedEffect(Unit) {
        viewModel.checkHealth()
    }

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.TopCenter
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = MaxReadableWidthDp.dp)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Cài Đặt PhimAI", color = palette.ivory, fontSize = 20.sp, fontWeight = FontWeight.Bold)

            // Server URL Card
            Surface(
                shape = RoundedCornerShape(CinemaRadius.container),
                color = palette.slate,
                border = BorderStroke(1.dp, palette.border)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Địa chỉ máy chủ PhimAI", color = palette.gold, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                    Text(
                        "Mặc định phimai.khoavo.myds.me. Bạn có thể trỏ sang máy chủ tự host LAN/NAS.",
                        color = palette.textMuted,
                        fontSize = 12.5.sp
                    )
                    OutlinedTextField(
                        value = draftUrl,
                        onValueChange = { draftUrl = it },
                        singleLine = true,
                        shape = RoundedCornerShape(CinemaRadius.element),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = palette.gold,
                            unfocusedBorderColor = palette.border,
                            focusedTextColor = palette.ivory,
                            unfocusedTextColor = palette.ivory,
                            focusedContainerColor = palette.obsidian,
                            unfocusedContainerColor = palette.obsidian
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = { viewModel.saveServerUrl(draftUrl) },
                            colors = ButtonDefaults.buttonColors(containerColor = palette.gold, contentColor = palette.obsidian)
                        ) {
                            Text("Lưu & Kiểm tra", fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(
                            onClick = {
                                draftUrl = PhimAiUtils.DEFAULT_SERVER_URL
                                viewModel.saveServerUrl(PhimAiUtils.DEFAULT_SERVER_URL)
                            }
                        ) {
                            Text("Mặc định", color = palette.textSecondary)
                        }
                    }

                    when {
                        healthState.checking -> Text("Đang kiểm tra máy chủ...", color = palette.textMuted, fontSize = 12.5.sp)
                        healthState.error != null -> Text("Lỗi: ${healthState.error}", color = palette.crimsonSoft, fontSize = 12.5.sp)
                        healthState.health != null -> {
                            val h = healthState.health!!
                            Text(
                                "Kết nối OK • v${h.version} • ${h.liveFilms} phim khả dụng • Video Backend: ${if (h.backendConfigured) "Sẵn sàng" else "Chưa cấu hình KVTUBE_URL"}",
                                color = if (h.ok) palette.emerald else palette.amber,
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
            }

            // Playback Quality & Preferences
            Surface(
                shape = RoundedCornerShape(CinemaRadius.container),
                color = palette.slate,
                border = BorderStroke(1.dp, palette.border)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Chất lượng phát mặc định", color = palette.gold, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        QualityTier.entries.forEach { tier ->
                            val selected = defaultQuality == tier
                            Surface(
                                shape = RoundedCornerShape(CinemaRadius.element),
                                color = if (selected) palette.gold else palette.slateRaised,
                                border = BorderStroke(1.dp, if (selected) palette.gold else palette.border),
                                modifier = Modifier.clickable { viewModel.setDefaultQuality(tier) }
                            ) {
                                Text(
                                    text = tier.label,
                                    color = if (selected) palette.obsidian else palette.ivory,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                                )
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Tự động chuyển tập tiếp theo", color = palette.ivory, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Text("Phát nối tiếp khi hết phim hoặc hết tập", color = palette.textMuted, fontSize = 12.sp)
                        }
                        Switch(
                            checked = autoPlayNext,
                            onCheckedChange = { viewModel.setAutoPlayNext(it) },
                            colors = SwitchDefaults.colors(checkedThumbColor = palette.obsidian, checkedTrackColor = palette.gold)
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Gom bộ phim theo tập trên lưới", color = palette.ivory, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Text("Hiển thị thẻ chồng tập kèm nút chọn tập nhanh", color = palette.textMuted, fontSize = 12.sp)
                        }
                        Switch(
                            checked = stackSeries,
                            onCheckedChange = { viewModel.setStackSeries(it) },
                            colors = SwitchDefaults.colors(checkedThumbColor = palette.obsidian, checkedTrackColor = palette.gold)
                        )
                    }
                }
            }

            // App Update & Maintenance
            Surface(
                shape = RoundedCornerShape(CinemaRadius.container),
                color = palette.slate,
                border = BorderStroke(1.dp, palette.border)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Ứng dụng & Dữ liệu", color = palette.gold, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                    Text("PhimAI Android v${BuildConfig.VERSION_NAME}", color = palette.textSecondary, fontSize = 13.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = { viewModel.checkUpdate() },
                            colors = ButtonDefaults.buttonColors(containerColor = palette.slateRaised, contentColor = palette.ivory)
                        ) {
                            Text(if (updateState.checking) "Đang kiểm tra..." else "Kiểm tra cập nhật")
                        }
                        OutlinedButton(onClick = { viewModel.clearHistory() }) {
                            Text("Xóa lịch sử xem", color = palette.crimsonSoft)
                        }
                    }
                    updateState.statusMessage?.let { msg ->
                        Text(msg, color = palette.textSecondary, fontSize = 12.5.sp)
                    }
                    if (updateState.downloading) {
                        LinearProgressIndicator(
                            progress = { updateState.progress },
                            color = palette.gold,
                            trackColor = palette.slateRaised,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    updateState.update?.let { info ->
                        Button(
                            onClick = { viewModel.downloadAndInstallUpdate(info.downloadUrl) },
                            colors = ButtonDefaults.buttonColors(containerColor = palette.gold, contentColor = palette.obsidian)
                        ) {
                            Text("Tải & Cài v${info.latestVersion}", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
