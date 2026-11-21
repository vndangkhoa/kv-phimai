package com.phimai.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.material3.Button
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Text
import com.phimai.tv.BuildConfig
import com.phimai.tv.data.util.TvPhimAiUtils
import com.phimai.tv.ui.theme.TvCinema
import com.phimai.tv.viewmodel.SettingsViewModel

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SettingsScreen(
    vm: SettingsViewModel = viewModel()
) {
    val serverUrl by vm.serverUrl.collectAsState()
    val qualityCap by vm.qualityCap.collectAsState()
    val autoPlayNext by vm.autoPlayNext.collectAsState()
    val health by vm.health.collectAsState()
    val healthError by vm.healthError.collectAsState()
    val updateStatus by vm.updateStatus.collectAsState()
    val availableUpdate by vm.availableUpdate.collectAsState()

    var draftUrl by remember(serverUrl) { mutableStateOf(serverUrl) }

    TvLazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 36.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        item {
            Text("Cài Đặt PhimAI TV", color = TvCinema.Gold, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        }

        item {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(TvCinema.Slate)
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("Máy chủ PhimAI", color = TvCinema.Ivory, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = draftUrl,
                    onValueChange = { draftUrl = it },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = TvCinema.Gold,
                        unfocusedBorderColor = TvCinema.Border,
                        focusedTextColor = TvCinema.Ivory,
                        unfocusedTextColor = TvCinema.Ivory
                    ),
                    modifier = Modifier.fillMaxWidth(0.75f)
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = { vm.saveServerUrl(draftUrl) }) {
                        Text("Lưu & Kiểm tra")
                    }
                    OutlinedButton(onClick = {
                        draftUrl = TvPhimAiUtils.DEFAULT_SERVER_URL
                        vm.saveServerUrl(TvPhimAiUtils.DEFAULT_SERVER_URL)
                    }) {
                        Text("Mặc định")
                    }
                }
                when {
                    healthError != null -> Text("Lỗi: $healthError", color = TvCinema.CrimsonSoft)
                    health != null -> {
                        val h = health!!
                        Text(
                            "Kết nối OK • v${h.version} • ${h.liveFilms} phim khả dụng • Video Backend: ${if (h.backendConfigured) "Sẵn sàng" else "Chưa cấu hình KVTUBE_URL"}",
                            color = if (h.ok) TvCinema.Emerald else TvCinema.Gold,
                            fontSize = 13.sp
                        )
                    }
                }
            }
        }

        item {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(TvCinema.Slate)
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("Chất lượng phát tối đa mặc định", color = TvCinema.Ivory, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    listOf(0 to "Tự động", 2160 to "4K", 1080 to "1080p", 720 to "720p", 360 to "360p").forEach { (cap, label) ->
                        val selected = qualityCap == cap
                        if (selected) {
                            Button(onClick = { vm.setQualityCap(cap) }) { Text(label, fontWeight = FontWeight.Bold) }
                        } else {
                            OutlinedButton(onClick = { vm.setQualityCap(cap) }) { Text(label) }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = { vm.setAutoPlayNext(!autoPlayNext) }) {
                        Text("Tự phát tập tiếp theo: ${if (autoPlayNext) "BẬT" else "TẮT"}")
                    }
                    OutlinedButton(onClick = { vm.clearHistory() }) {
                        Text("Xóa lịch sử TV")
                    }
                }
            }
        }

        item {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(TvCinema.Slate)
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Phiên bản & Cập nhật", color = TvCinema.Ivory, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text("PhimAI TV v${BuildConfig.VERSION_NAME}", color = TvCinema.TextSecondary)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = { vm.checkUpdate() }) { Text("Kiểm tra cập nhật") }
                    availableUpdate?.let { info ->
                        Button(onClick = { vm.downloadAndInstall(info) }) {
                            Text("Cài đặt v${info.latestVersion}")
                        }
                    }
                }
                updateStatus?.let { Text(it, color = TvCinema.Gold, fontSize = 13.sp) }
            }
        }
    }
}
