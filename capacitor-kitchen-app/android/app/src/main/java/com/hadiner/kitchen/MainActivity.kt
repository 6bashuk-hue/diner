package com.hadiner.kitchen

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Local (non-npm) plugins are not auto-discovered by Capacitor —
        // they must be registered manually, before super.onCreate().
        registerPlugin(UsbThermalPrinterPlugin::class.java)
        registerPlugin(NativeHttpPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
