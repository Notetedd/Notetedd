
import React from "react";
import { createDrawerNavigator } from "@react-navigation/drawer";
import Sidebar from "./Sidebar";

// Import Screens
import ProfileScreen from "./ProfileScreen";
import ExportNotesScreen from "./SyncClassroomScreen";
import UploadPDFScreen from "./UploadPDFScreen";
import PrintNotesScreen from "./SellNotesScreen";
import PairedDevicesScreen from "./PairedDevicesScreen";
import SubscriptionPlanScreen from "./SubscriptionPlanScreen";
import PaymentMethodsScreen from "./PaymentMethodsScreen";
import NotificationsScreen from "./NotificationsScreen";
import DarkModeScreen from "./DarkModeScreen";
import PrivacyScreen from "./PrivacyScreen";
import PreferencesScreen from "./PrefferencesScreen";
import HelpSupportScreen from "./HelpSupportScreen";
import SyncClassroomScreen from "./SyncClassroomScreen";
import SellNotesScreen from "./SellNotesScreen";

const Drawer = createDrawerNavigator();

export default function DrawerLayout() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => (
        <Sidebar
          {...props}
          isOpen={props.state?.isDrawerOpen}
          onClose={props.navigation.closeDrawer}
        />
      )}
      screenOptions={{ headerShown: false }}
    >
      <Drawer.Screen name="Profile" component={ProfileScreen} />
      <Drawer.Screen name="SyncClassroomNotes" component={SyncClassroomScreen} />
      <Drawer.Screen name="Upload File" component={UploadPDFScreen} />
      <Drawer.Screen name="SellNotes" component={SellNotesScreen} />
      <Drawer.Screen name="PairedDevices" component={PairedDevicesScreen} />
      <Drawer.Screen name="SubscriptionPlan" component={SubscriptionPlanScreen} />
      <Drawer.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
      <Drawer.Screen name="Notifications" component={NotificationsScreen} />
      <Drawer.Screen name="DarkMode" component={DarkModeScreen} />
      <Drawer.Screen name="Privacy" component={PrivacyScreen} />
      <Drawer.Screen name="Preferences" component={PreferencesScreen} />
      <Drawer.Screen name="HelpSupport" component={HelpSupportScreen} />
    </Drawer.Navigator>
  );
}
