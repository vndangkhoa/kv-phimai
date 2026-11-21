package com.phimai.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmarks
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tv
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Border
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.phimai.tv.R
import com.phimai.tv.ui.theme.TvCinema

data class TvNavItem(val route: String, val label: String, val icon: ImageVector)

val phimAiTvNavItems = listOf(
    TvNavItem("home", "Trang chủ", Icons.Filled.Home),
    TvNavItem("trending", "Thịnh hành", Icons.Filled.LocalFireDepartment),
    TvNavItem("channels", "Kênh", Icons.Filled.Tv),
    TvNavItem("search", "Tìm kiếm", Icons.Filled.Search),
    TvNavItem("library", "Thư viện", Icons.Filled.Bookmarks),
    TvNavItem("settings", "Cài đặt", Icons.Filled.Settings)
)

const val TV_NAV_RAIL_WIDTH = 76

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PhimAiSideNav(
    currentRoute: String?,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .width(TV_NAV_RAIL_WIDTH.dp)
            .fillMaxHeight()
            .background(TvCinema.Slate)
            .padding(vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Image(
            painter = painterResource(id = R.drawable.ic_phimai_logo),
            contentDescription = "PhimAI",
            modifier = Modifier
                .size(42.dp)
                .clip(RoundedCornerShape(10.dp))
        )
        Spacer(Modifier.height(4.dp))
        Text("4K", color = TvCinema.Gold, fontSize = 9.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(20.dp))

        phimAiTvNavItems.forEach { item ->
            val selected = currentRoute == item.route ||
                (item.route == "home" && currentRoute == null) ||
                (item.route == "channels" && currentRoute == "channel")
            TvNavRailButton(
                item = item,
                selected = selected,
                onClick = { onNavigate(item.route) }
            )
            Spacer(Modifier.height(10.dp))
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun TvNavRailButton(
    item: TvNavItem,
    selected: Boolean,
    onClick: () -> Unit
) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(14.dp)

    Surface(
        onClick = onClick,
        modifier = Modifier
            .size(48.dp)
            .onFocusChanged { focused = it.isFocused },
        shape = ClickableSurfaceDefaults.shape(shape),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.10f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (selected && !focused) TvCinema.GoldMuted else Color.Transparent,
            focusedContainerColor = TvCinema.Gold,
            contentColor = if (selected) TvCinema.Gold else TvCinema.TextSecondary,
            focusedContentColor = TvCinema.Obsidian
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(1.dp, if (selected) TvCinema.Gold.copy(alpha = 0.45f) else Color.Transparent)),
            focusedBorder = Border(BorderStroke(2.dp, TvCinema.Gold))
        )
    ) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Icon(
                imageVector = item.icon,
                contentDescription = item.label,
                modifier = Modifier.size(22.dp),
                tint = when {
                    focused -> TvCinema.Obsidian
                    selected -> TvCinema.Gold
                    else -> TvCinema.TextSecondary
                }
            )
        }
    }
}
