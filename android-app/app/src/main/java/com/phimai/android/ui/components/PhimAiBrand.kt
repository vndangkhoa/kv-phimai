package com.phimai.android.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.phimai.android.R
import com.phimai.android.ui.theme.cinema

@Composable
fun PhimAiLogo(
    modifier: Modifier = Modifier,
    iconSize: Dp = 28.dp,
    showWordmark: Boolean = true,
    show4KBadge: Boolean = true,
    onlineCount: Int? = null
) {
    val palette = cinema
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Image(
            painter = painterResource(id = R.drawable.ic_phimai_logo),
            contentDescription = "PhimAI",
            modifier = Modifier
                .size(iconSize)
                .clip(RoundedCornerShape(iconSize * 0.22f))
        )
        if (showWordmark) {
            Text(
                text = buildAnnotatedString {
                    withStyle(SpanStyle(color = palette.crimson, fontWeight = FontWeight.Bold)) {
                        append("Phim")
                    }
                    withStyle(SpanStyle(color = palette.ivory, fontWeight = FontWeight.Bold)) {
                        append("AI")
                    }
                },
                fontSize = (iconSize.value * 0.68f).sp,
                letterSpacing = (-0.5).sp
            )
        }
        if (show4KBadge) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(palette.gold.copy(alpha = 0.14f))
                    .border(1.dp, palette.gold.copy(alpha = 0.35f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 5.dp, vertical = 2.dp)
            ) {
                Text(
                    text = "4K",
                    color = palette.gold,
                    fontSize = 9.5.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 0.4.sp
                )
            }
        }
        if (onlineCount != null && onlineCount > 0) {
            Surface(
                shape = RoundedCornerShape(100.dp),
                color = palette.emerald.copy(alpha = 0.12f),
                border = BorderStroke(1.dp, palette.emerald.copy(alpha = 0.32f))
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(palette.emerald)
                    )
                    Text(
                        text = "$onlineCount đang xem",
                        color = Color(0xFF34D399),
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

@Composable
fun ChannelInitialAvatar(
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 36.dp
) {
    val palette = cinema
    val initial = name.trim().take(1).uppercase().ifBlank { "P" }
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(palette.slateRaised)
            .border(1.dp, palette.borderEmphasized, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = initial,
            color = palette.gold,
            fontSize = (size.value * 0.42f).sp,
            fontWeight = FontWeight.Bold
        )
    }
}
