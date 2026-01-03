import Toast from "react-native-toast-message";

export const showToast = (type, text1, text2) => {
  Toast.show({
    type: type || "success", // Default to "success" if type is not provided
    text1: text1 || "Notification",
    text2: text2 || "",
    position: "top", // Ensure the toast is visible
    visibilityTime: 4000,
    autoHide: true,
  });
};

export default Toast;
