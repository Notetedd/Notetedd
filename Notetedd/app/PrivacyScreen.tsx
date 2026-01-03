import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import BackButton from '../components/Backbutton';

export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.container}>
      <MaterialIcons 
        name="shield" 
        size={50} 
        color="#7c3aed" 
        style={styles.icon} 
      />
      <BackButton />
      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.subtitle}>Last Updated: December 2025</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Introduction</Text>
        <Text style={styles.content}>
          Notetedd ("we," "our," or "us") is committed to protecting your privacy. 
          This Privacy Policy explains how we collect, use, disclose, and safeguard 
          your information when you use our mobile application for lecture recording 
          and AI-powered note generation.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. Information We Collect</Text>
        
        <Text style={styles.subsectionTitle}>2.1 Audio Recordings</Text>
        <Text style={styles.content}>
          • Lecture audio recordings you create through the app{'\n'}
          • Audio files are processed to generate transcriptions{'\n'}
          • Recordings are stored locally on your device by default
        </Text>

        <Text style={styles.subsectionTitle}>2.2 Transcription Data</Text>
        <Text style={styles.content}>
          • Text transcriptions of your recorded lectures{'\n'}
          • AI-processed and organized notes generated from transcriptions{'\n'}
          • Metadata including timestamps, titles, and tags
        </Text>

        <Text style={styles.subsectionTitle}>2.3 Usage Data</Text>
        <Text style={styles.content}>
          • App usage statistics and analytics{'\n'}
          • Device information (OS version, device type){'\n'}
          • Crash reports and error logs for app improvement
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3. How We Use Your Information</Text>
        <Text style={styles.content}>
          • To provide transcription services for your audio recordings{'\n'}
          • To generate AI-powered organized notes from lecture content{'\n'}
          • To improve our AI processing algorithms and app functionality{'\n'}
          • To provide customer support and respond to your requests{'\n'}
          • To send important service updates and notifications
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>4. Data Processing and AI</Text>
        <Text style={styles.content}>
          When you save a recording, your audio is:{'\n\n'}
          • Sent to our secure servers for transcription processing{'\n'}
          • Processed by AI models to generate organized notes{'\n'}
          • Typically completed within 10-20 seconds{'\n'}
          • Encrypted during transmission using industry-standard protocols{'\n\n'}
          Your data is processed solely for the purpose of providing you with 
          transcription and note generation services.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>5. Data Storage and Security</Text>
        <Text style={styles.content}>
          • Local Storage: Recordings and notes are stored on your device{'\n'}
          • Cloud Backup: Optional cloud sync for backup purposes{'\n'}
          • Encryption: Data is encrypted both in transit and at rest{'\n'}
          • Access Controls: Only you can access your personal notes{'\n'}
          • Server Storage: Processing data is retained for 30 days for quality assurance
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>6. Data Sharing and Disclosure</Text>
        <Text style={styles.content}>
          We do NOT sell your personal information. We may share data only in these circumstances:{'\n\n'}
          • With your explicit consent{'\n'}
          • With service providers who assist in app functionality (e.g., cloud storage, AI processing){'\n'}
          • To comply with legal obligations or protect our rights{'\n'}
          • In connection with a business transfer or merger
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>7. Your Rights and Choices</Text>
        <Text style={styles.content}>
          You have the right to:{'\n\n'}
          • Access: View all data we have collected about you{'\n'}
          • Delete: Request deletion of your account and all associated data{'\n'}
          • Export: Download your notes and transcriptions{'\n'}
          • Opt-Out: Disable analytics and non-essential data collection{'\n'}
          • Correct: Update or correct inaccurate information
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>8. Children's Privacy</Text>
        <Text style={styles.content}>
          Notetedd is intended for users aged 18 and older. We do not knowingly 
          collect personal information from children under 18. If we learn we have 
          collected such information, we will take steps to delete it promptly.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>9. Data Retention</Text>
        <Text style={styles.content}>
          • Active recordings and notes: Retained until you delete them{'\n'}
          • Processing data: Automatically deleted after 30 days{'\n'}
          • Account data: Deleted within 90 days of account closure{'\n'}
          • Analytics data: Aggregated and anonymized after 12 months
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>10. International Data Transfers</Text>
        <Text style={styles.content}>
          Your information, specifically lecture recordings, may be transferred to and processed in countries other 
          than your own. We ensure appropriate safeguards are in place to protect 
          your data in compliance with applicable data protection laws, including 
          GDPR and CCPA.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>11. Compliance</Text>
        <Text style={styles.content}>
          We comply with:{'\n\n'}
          • GDPR (General Data Protection Regulation){'\n'}
          • CCPA (California Consumer Privacy Act){'\n'}
          • COPPA (Children's Online Privacy Protection Act){'\n'}
          • FERPA (Family Educational Rights and Privacy Act) - for educational institutions{'\n'}
          • SOC 2 Type II security standards
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>12. Changes to This Policy</Text>
        <Text style={styles.content}>
          We may update this Privacy Policy periodically. We will notify you of 
          significant changes through the app or via email. Your continued use of 
          NotedEd after changes indicates acceptance of the updated policy.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>13. Contact Us</Text>
        <Text style={styles.content}>
          If you have questions or concerns about this Privacy Policy:{'\n\n'}
          Email: notetedd@gmail.com{'\n'}
          Phone: +254 704697508{'\n'}
          Address: Notetedd, Nairobi -Kenya{'\n'}
          Website: www.noteded.com/privacy{'\n\n'}
          For data subject requests, please email: notetedd@gmail.com
        </Text>
      </View>

      <View style={styles.footer}>
        <MaterialIcons name="verified-user" size={24} color="#7c3aed" />
        <Text style={styles.footerText}>
          Your privacy and security are our top priorities
        </Text>
      </View>

      <View style={styles.spacing} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 20,
  },
  icon: {
    alignSelf: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#7c3aed',
    textAlign: 'center',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 30,
  },
  section: {
    marginBottom: 25,
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4b5563',
    marginTop: 12,
    marginBottom: 6,
  },
  content: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 24,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f3e8ff',
    borderRadius: 12,
    marginTop: 10,
  },
  footerText: {
    fontSize: 14,
    color: '#7c3aed',
    fontWeight: '600',
    marginLeft: 10,
  },
  spacing: {
    height: 40,
  },
});