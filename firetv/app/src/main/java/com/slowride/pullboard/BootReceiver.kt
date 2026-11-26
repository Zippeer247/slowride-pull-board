package com.slowride.pullboard

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Opens the board when the Fire Stick powers on (or after the app is updated). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Exported so the system can reach it; ignore anything that isn't one of its broadcasts.
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val start = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        context.startActivity(start)
    }
}
