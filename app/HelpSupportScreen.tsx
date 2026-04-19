import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Linking,
  Animated,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {MaterialIcons} from "@expo/vector-icons";
import haptics from "./utils/haptics";
import { useTheme } from "./context/ThemeContext";
import BackButton from "../components/Backbutton";

export default function HelpSupportScreen({ navigation, route }) {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFAQ, setExpandedFAQ] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const categories = [
    { id: "all", label: "All", icon: "apps" },
    { id: "recording", label: "Recording", icon: "mic" },
    { id: "transcription", label: "Transcription", icon: "article" },
    { id: "subscription", label: "Subscription", icon: "stars" },
    { id: "account", label: "Account", icon: "person" },
  ];

  const faqs = [
    {
      category: "recording",
      question: "How do I start recording a lecture?",
      answer: "Tap the microphone icon on the home screen or navigate to the Record tab. Press 'Start Recording' and begin capturing your lecture. You can pause and resume at any time.",
    },
    {
      category: "recording",
      question: "What audio formats are supported?",
      answer: "We support all common audio formats including MP3, WAV, M4A, and AAC. The app automatically selects the best format for your device.",
    },
    {
      category: "transcription",
      question: "How accurate is the transcription?",
      answer: "Our AI-powered transcription achieves 95%+ accuracy in clear audio conditions. Accuracy depends on audio quality, background noise, and speaker clarity.",
    },
    {
      category: "transcription",
      question: "Can I edit transcriptions?",
      answer: "Yes! All transcriptions are editable. Simply tap on any text to make corrections. Your edits are saved automatically.",
    },
    {
      category: "subscription",
      question: "What's the difference between Free and Pro?",
      answer: "Free plan includes 5 recordings/month with basic transcription. Pro offers unlimited recordings, AI summaries, advanced analytics, cloud storage, and priority support.",
    },
    {
      category: "subscription",
      question: "Can I cancel my subscription anytime?",
      answer: "Yes, you can cancel anytime from your subscription settings. You'll still have access until the end of your billing period.",
    },
    {
      category: "account",
      question: "How do I reset my password?",
      answer: "Go to Settings > Account > Reset Password. You'll receive a password reset link via email.",
    },
    {
      category: "account",
      question: "Is my data secure?",
      answer: "Absolutely! We use end-to-end encryption for all recordings and transcriptions. Your data is stored securely and never shared with third parties.",
    },
  ];

  const contactOptions = [
    {
      icon: "email",
      title: "Email Support",
      subtitle: "info@notetedd.com",
      color: "#9B5DE5",
      action: () => Linking.openURL("mailto:info@notetedd.com"),
    },
    {
      icon: "chat",
      title: "Live Chat",
      subtitle: "Average response: 2 minutes",
      color: "#10B981",
      action: () => Alert.alert("Live Chat", "Opening chat window..."),
    },
    {
      icon: "phone",
      title: "Call Us",
      subtitle: "+254704697508",
      color: "#3B82F6",
      action: () => Linking.openURL("tel:+254704697508"),
    },
    {
      icon: "forum",
      title: "Community Forum",
      subtitle: "Get help from other students",
      color: "#F59E0B",
      action: () => Linking.openURL("https://discord.gg/axt3G9T8"),
    },
  ];

  const quickLinks = [
    { icon: "menu-book", title: "User Guide", url: "https://notetedd.com/features" },
    { icon: "play-circle", title: "Video Tutorials", url: "https://youtube.com/@notetedd" },
    { icon: "bug-report", title: "Report a Bug", url: "https://notetedd.com/contact" },
    { icon: "lightbulb", title: "Feature Requests", url: "https://notetedd.com/contact" },
  ];

  const filteredFAQs = faqs.filter(faq => 
    (selectedCategory === "all" || faq.category === selectedCategory) &&
    (searchQuery === "" || 
     faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
     faq.answer.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const toggleFAQ = async (index) => {
    await haptics.impact("Light");
    setExpandedFAQ(expandedFAQ === index ? null : index);
  };

  const handleContactOption = async (action) => {
    await haptics.impact("Medium");
    action();
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Header */}
      <LinearGradient
        colors={isDark ? ["#1F2937", "#374151"] : ["#9B5DE5", "#7C3AED"]}
        style={styles.header}
      >
        <BackButton />
        
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <View style={[styles.searchBar, isDark && styles.searchBarDark]}>
              <MaterialIcons name="search" size={22} color="#9CA3AF" />
              <TextInput
                style={[styles.searchInput, isDark && styles.searchInputDark]}
                placeholder="Search for help..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery !== "" && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <MaterialIcons name="close" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Contact Options */}
          <View style={styles.contactContainer}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
              Get in Touch
            </Text>
            
            <View style={styles.contactGrid}>
              {contactOptions.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.contactCard, isDark && styles.contactCardDark]}
                  onPress={() => handleContactOption(option.action)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.contactIcon, { backgroundColor: option.color + "20" }]}>
                    <MaterialIcons name={option.icon} size={28} color={option.color} />
                  </View>
                  <Text style={[styles.contactTitle, isDark && styles.textDark]}>
                    {option.title}
                  </Text>
                  <Text style={[styles.contactSubtitle, isDark && styles.textSecondaryDark]}>
                    {option.subtitle}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* FAQ Categories */}
          <View style={styles.categoriesContainer}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoriesScroll}
            >
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  onPress={() => {
                    haptics.impact("Light");
                    setSelectedCategory(category.id);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.categoryChip,
                    selectedCategory === category.id && styles.categoryChipActive,
                    isDark && styles.categoryChipDark,
                    isDark && selectedCategory === category.id && styles.categoryChipActiveDark,
                  ]}>
                    <MaterialIcons 
                      name={category.icon} 
                      size={18} 
                      color={selectedCategory === category.id ? "#fff" : (isDark ? "#9CA3AF" : "#6B7280")} 
                    />
                    <Text style={[
                      styles.categoryText,
                      selectedCategory === category.id && styles.categoryTextActive,
                      isDark && styles.categoryTextDark,
                    ]}>
                      {category.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* FAQ Section */}
          <View style={styles.faqContainer}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
              Frequently Asked Questions
            </Text>

            {filteredFAQs.length === 0 ? (
              <View style={[styles.noResults, isDark && styles.noResultsDark]}>
                <MaterialIcons name="search-off" size={48} color="#D1D5DB" />
                <Text style={[styles.noResultsText, isDark && styles.textSecondaryDark]}>
                  No results found
                </Text>
                <Text style={[styles.noResultsSubtext, isDark && styles.textSecondaryDark]}>
                  Try a different search term or category
                </Text>
              </View>
            ) : (
              filteredFAQs.map((faq, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => toggleFAQ(index)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.faqCard,
                    isDark && styles.faqCardDark,
                    expandedFAQ === index && styles.faqCardExpanded,
                  ]}>
                    <View style={styles.faqHeader}>
                      <Text style={[styles.faqQuestion, isDark && styles.textDark]}>
                        {faq.question}
                      </Text>
                      <MaterialIcons 
                        name={expandedFAQ === index ? "expand-less" : "expand-more"} 
                        size={24} 
                        color={isDark ? "#9CA3AF" : "#6B7280"} 
                      />
                    </View>
                    
                    {expandedFAQ === index && (
                      <Text style={[styles.faqAnswer, isDark && styles.textSecondaryDark]}>
                        {faq.answer}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Quick Links */}
          <View style={[styles.linksContainer, isDark && styles.linksContainerDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
              Helpful Resources
            </Text>

            {quickLinks.map((link, index) => (
              <TouchableOpacity
                key={index}
                style={styles.linkRow}
                onPress={() => {
                  haptics.impact("Light");
                  Linking.openURL(link.url);
                }}
              >
                <View style={styles.linkLeft}>
                  <MaterialIcons 
                    name={link.icon} 
                    size={22} 
                    color={isDark ? "#9CA3AF" : "#6B7280"} 
                  />
                  <Text style={[styles.linkText, isDark && styles.textDark]}>
                    {link.title}
                  </Text>
                </View>
                <MaterialIcons 
                  name="open-in-new" 
                  size={18} 
                  color={isDark ? "#6B7280" : "#9CA3AF"} 
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Feedback Section */}
          <View style={[styles.feedbackContainer, isDark && styles.feedbackContainerDark]}>
            <MaterialIcons name="feedback" size={32} color="#9B5DE5" />
            <Text style={[styles.feedbackTitle, isDark && styles.textDark]}>
              Can't find what you're looking for?
            </Text>
            <Text style={[styles.feedbackText, isDark && styles.textSecondaryDark]}>
              Send us a message and we'll get back to you as soon as possible
            </Text>
            <TouchableOpacity style={styles.feedbackButton}>
              <LinearGradient
                colors={["#9B5DE5", "#7C3AED"]}
                style={styles.feedbackButtonGradient}
              >
                <MaterialIcons name="send" size={20} color="#fff" />
                <Text style={styles.feedbackButtonText}>Send Feedback</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  containerDark: {
    backgroundColor: "#0F172A",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  content: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  searchBarDark: {
    backgroundColor: "#1F2937",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#1F2937",
  },
  searchInputDark: {
    color: "#F9FAFB",
  },
  contactContainer: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 16,
  },
  contactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  contactCard: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  contactCardDark: {
    backgroundColor: "#1F2937",
  },
  contactIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  contactTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 4,
    textAlign: "center",
  },
  contactSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  categoriesContainer: {
    marginTop: 24,
  },
  categoriesScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  categoryChipDark: {
    backgroundColor: "#1F2937",
  },
  categoryChipActive: {
    backgroundColor: "#9B5DE5",
  },
  categoryChipActiveDark: {
    backgroundColor: "#7C3AED",
  },
  categoryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  categoryTextDark: {
    color: "#9CA3AF",
  },
  categoryTextActive: {
    color: "#fff",
  },
  faqContainer: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  noResults: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 48,
    alignItems: "center",
  },
  noResultsDark: {
    backgroundColor: "#1F2937",
  },
  noResultsText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
  },
  noResultsSubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 4,
  },
  faqCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  faqCardDark: {
    backgroundColor: "#1F2937",
  },
  faqCardExpanded: {
    borderLeftWidth: 4,
    borderLeftColor: "#9B5DE5",
  },
  faqHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
    marginRight: 12,
  },
  faqAnswer: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 22,
    marginTop: 12,
  },
  linksContainer: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 24,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  linksContainerDark: {
    backgroundColor: "#1F2937",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  linkLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  linkText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1F2937",
  },
  feedbackContainer: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 32,
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 32,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  feedbackContainerDark: {
    backgroundColor: "#1F2937",
  },
  feedbackTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: 16,
    textAlign: "center",
  },
  feedbackText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  feedbackButton: {
    marginTop: 20,
    borderRadius: 12,
    overflow: "hidden",
  },
  feedbackButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 8,
  },
  feedbackButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  textDark: {
    color: "#F9FAFB",
  },
  textSecondaryDark: {
    color: "#D1D5DB",
  },
});