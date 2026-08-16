import React from "react";
import { Drawer } from "expo-router/drawer";
import Sidebar from "./Sidebar";

export default function DrawerLayout() {
  return (
    <Drawer
      drawerContent={(props) => (
        <Sidebar
          {...props}
          isOpen={props.state?.isDrawerOpen}
          onClose={props.navigation.closeDrawer}
        />
      )}
      screenOptions={{ headerShown: false }}
    >
      <Drawer.Screen name="ProfileScreen" options={{ drawerLabel: "Profile" }} />
      <Drawer.Screen name="SyncClassroomScreen" options={{ drawerLabel: "SyncClassroomNotes" }} />
      <Drawer.Screen name="UploadPDFScreen" options={{ drawerLabel: "Upload File" }} />
      <Drawer.Screen name="SellNotesScreen" options={{ drawerLabel: "SellNotes" }} />
      <Drawer.Screen name="PairedDevicesScreen" options={{ drawerLabel: "PairedDevices" }} />
      <Drawer.Screen name="SubscriptionPlanScreen" options={{ drawerLabel: "SubscriptionPlan" }} />
      <Drawer.Screen name="PaymentMethodsScreen" options={{ drawerLabel: "PaymentMethods" }} />
      <Drawer.Screen name="NotificationsScreen" options={{ drawerLabel: "Notifications" }} />
      <Drawer.Screen name="DarkModeScreen" options={{ drawerLabel: "DarkMode" }} />
      <Drawer.Screen name="PrivacyScreen" options={{ drawerLabel: "Privacy" }} />
      <Drawer.Screen name="PreferencesScreen" options={{ drawerLabel: "Preferences" }} />
      <Drawer.Screen name="HelpSupportScreen" options={{ drawerLabel: "HelpSupport" }} />
    </Drawer>
  );
}