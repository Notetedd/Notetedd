import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated, ScrollView, Platform, Linking } from 'react-native';
import { router } from 'expo-router';

const { width, height } = Dimensions.get('window');
const isSmallDevice = height < 700;
const isTablet = width > 600;

const OnboardingScreen = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const scrollViewRef = useRef(null);
  const imageScale = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const scrollX = useRef(new Animated.Value(0)).current;
  const mountedRef = useRef(false);

  const slides = [
    {
      id: '1',
      title: 'Record & Transcribe',
      subtitle: 'Never Miss a concept',
      description: 'Transform audio from lectures into text instantly. Sit, and watch your notes write themselves.',
      accentColor: '#e67e22',
      imageEmoji: '🎙️',
      decorEmojis: ['🎵', '📝', '✨'],
      features: ['Real-time magic', 'Offline ready', 'Any language']
    },
    {
      id: '2',
      title: 'Smart Organization',
      subtitle: 'Find Anything, Fast',
      description: 'Your notes, sorted perfectly. Search in seconds between text and audio notes.',
      accentColor: '#9B5DE5',
      imageEmoji: '📚',
      decorEmojis: ['🗂️', '🔍', '⚡'],
      features: ['Diagrams/Calculations', 'Power search', 'Custom tags']
    },
    {
      id: '3',
      title: 'AI-Powered Brain',
      subtitle: 'Study Like a Pro',
      description: 'Get summaries, flashcards, and study guides created automatically. Let Tedd do the heavy lifting.',
      accentColor: '#e67e22',
      imageEmoji: '🧠',
      decorEmojis: ['💡', '🎯', '🚀'],
      features: ['Auto summaries', 'Smart highlights', 'Quiz builder']
    },
    {
      id: '4',
      title: 'Always Synced',
      subtitle: 'Your Notes Everywhere',
      description: 'Import from classroom to your Phone, laptop, tablet — your notes follow you. Cloud backup means never losing progress.',
      accentColor: '#9B5DE5',
      imageEmoji: '☁️',
      decorEmojis: ['📱', '💻', '⚡'],
      features: ['Cloud backup', 'Multi-device', 'Offline mode']
    }
  ];

  useEffect(() => {
    // Initialize component
    if (!mountedRef.current) {
      mountedRef.current = true;
      
      // For web, we need a longer delay to ensure proper initialization
      const initDelay = Platform.OS === 'web' ? 200 : 50;
      
      const timer = setTimeout(() => {
        setIsReady(true);
        
        // Ensure we're at the first slide
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({
            x: 0,
            y: 0,
            animated: false,
          });
        }
        
        // Start animations for first slide
        startSlideAnimations();
      }, initDelay);

      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (isReady) {
      startSlideAnimations();
    }
  }, [currentIndex, isReady]);

  const startSlideAnimations = () => {
    // Reset animations
    imageScale.setValue(0);
    contentOpacity.setValue(0);

    Animated.parallel([
      Animated.spring(imageScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 800,
        delay: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Floating animation
    const floatingAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    floatingAnimation.start();

    return () => floatingAnimation.stop();
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: false,
      listener: (event) => {
        const offsetX = event.nativeEvent.contentOffset.x;
        const index = Math.round(offsetX / width);
        if (index !== currentIndex && index >= 0 && index < slides.length) {
          setCurrentIndex(index);
        }
      },
    }
  );

  const scrollToIndex = (index) => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: index * width,
        animated: true,
      });
    }
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      const nextIndex = currentIndex + 1;
      scrollToIndex(nextIndex);
      setCurrentIndex(nextIndex);
    }
  };

  const handleSkip = () => {
    const lastIndex = slides.length - 1;
    scrollToIndex(lastIndex);
    setCurrentIndex(lastIndex);
  };

  const handleGetStarted = () => {
    router.push('/AuthScreen');
  };

  const handleOpenLink = async (url) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error('Error opening link:', error);
    }
  };

  const floatY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -20],
  });

  const renderSlide = (item, index) => {
    return (
      <View key={item.id} style={styles.slideWrapper}>
        <ScrollView 
          style={styles.slideScroll}
          contentContainerStyle={styles.slideScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.slide}>
            {/* Accent Color Block */}
            <View style={[styles.colorBlock, { backgroundColor: item.accentColor }]} />
            
            {/* Decorative Emojis */}
            <View style={styles.decorContainer}>
              <Text style={[styles.decorEmoji, styles.decor1]}>{item.decorEmojis[0]}</Text>
              <Text style={[styles.decorEmoji, styles.decor2]}>{item.decorEmojis[1]}</Text>
              <Text style={[styles.decorEmoji, styles.decor3]}>{item.decorEmojis[2]}</Text>
            </View>

            {/* Main Image/Emoji */}
            <Animated.View style={[
              styles.imageContainer,
              {
                transform: [
                  { scale: imageScale },
                  { translateY: floatY },
                ],
              },
            ]}>
              <View style={[styles.emojiCircle, { borderColor: item.accentColor }]}>
                <Text style={styles.mainEmoji}>{item.imageEmoji}</Text>
              </View>
            </Animated.View>

            {/* Content */}
            <Animated.View style={[styles.textContainer, { opacity: contentOpacity }]}>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={[styles.subtitle, { color: item.accentColor }]} numberOfLines={1}>
                {item.subtitle}
              </Text>
              <Text style={styles.description} numberOfLines={isSmallDevice ? 3 : 4}>
                {item.description}
              </Text>

              <View style={[styles.featuresContainer, { borderLeftColor: item.accentColor }]}>
                {item.features.map((feature, idx) => (
                  <Animated.View 
                    key={idx} 
                    style={[
                      styles.featureItem,
                      {
                        opacity: contentOpacity,
                        transform: [{
                          translateX: contentOpacity.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-30, 0],
                          }),
                        }],
                      },
                    ]}
                  >
                    <View style={[styles.featureDot, { backgroundColor: item.accentColor }]} />
                    <Text style={styles.featureText} numberOfLines={1}>
                      {feature}
                    </Text>
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderPagination = () => {
    return (
      <View style={styles.paginationContainer}>
        {slides.map((_, index) => {
          const inputRange = [
            (index - 1) * width,
            index * width,
            (index + 1) * width
          ];

          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [10, 30, 10],
            extrapolate: 'clamp'
          });

          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.4, 1, 0.4],
            extrapolate: 'clamp'
          });

          return (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  width: dotWidth,
                  opacity,
                  backgroundColor: index % 2 === 0 ? '#e67e22' : '#9B5DE5'
                }
              ]}
            />
          );
        })}
      </View>
    );
  };

  // Show loading state until ready
  if (!isReady) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.logo} adjustsFontSizeToFit numberOfLines={1}>
            Note<Text style={styles.logoAccent}>tedd</Text>
          </Text>
          <Text style={styles.tagline} numberOfLines={1}>Learning Redefined</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo} adjustsFontSizeToFit numberOfLines={1}>
          Note<Text style={styles.logoAccent}>tedd</Text>
        </Text>
        <Text style={styles.tagline} numberOfLines={1}>Learning Redefined</Text>
      </View>

      {/* Slides */}
      <View style={styles.slidesContainer}>
        <Animated.ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          bounces={false}
          decelerationRate="fast"
          snapToInterval={width}
          snapToAlignment="center"
        >
          {slides.map((item, index) => renderSlide(item, index))}
        </Animated.ScrollView>
      </View>

      {/* Pagination */}
      {renderPagination()}

      {/* Bottom Buttons */}
      <View style={styles.bottomContainer}>
        {currentIndex < slides.length - 1 ? (
          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={styles.skipButton}
              onPress={handleSkip}
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.nextButton}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <Text style={styles.nextText}>Next →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.getStartedButton}
            onPress={handleGetStarted}
            activeOpacity={0.85}
          >
            <Text style={styles.getStartedText}>Get Started → </Text>
          </TouchableOpacity>
        )}

        {/* Legal Links */}
        <View style={styles.legalContainer}>
          <Text style={styles.legalText}>By continuing, you agree to our </Text>
          <TouchableOpacity 
            onPress={() => handleOpenLink('https://www.notetedd.com/termsofservice')}
            activeOpacity={0.7}
          >
            <Text style={styles.legalLink}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={styles.legalText}> and </Text>
          <TouchableOpacity 
            onPress={() => handleOpenLink('https://www.notetedd.com/privacypolicy')}
            activeOpacity={0.7}
          >
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: isSmallDevice ? 10 : 20,
    alignItems: 'center',
    zIndex: 10,
  },
  logo: {
    fontSize: isTablet ? 44 : isSmallDevice ? 28 : 36,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  logoAccent: {
    color: '#e67e22',
  },
  tagline: {
    fontSize: isTablet ? 16 : isSmallDevice ? 12 : 14,
    color: '#9B5DE5',
    marginTop: 4,
    fontWeight: '700',
  },
  slidesContainer: {
    flex: 1,
  },
  slideWrapper: {
    width: width,
  },
  slideScroll: {
    flex: 1,
  },
  slideScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  slide: {
    width: width,
    alignItems: 'center',
    paddingHorizontal: isTablet ? 60 : 24,
    paddingVertical: isSmallDevice ? 10 : 20,
    justifyContent: 'center',
    position: 'relative',
  },
  colorBlock: {
    position: 'absolute',
    width: isTablet ? 350 : 250,
    height: isTablet ? 350 : 250,
    top: isSmallDevice ? -20 : 0,
    right: isTablet ? -100 : -50,
    borderRadius: 20,
    opacity: 0.15,
    transform: [{ rotate: '25deg' }],
  },
  decorContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  decorEmoji: {
    fontSize: isSmallDevice ? 30 : 40,
    position: 'absolute',
    opacity: 0.3,
  },
  decor1: {
    top: '15%',
    left: '10%',
  },
  decor2: {
    top: '60%',
    right: '15%',
  },
  decor3: {
    bottom: '25%',
    left: '15%',
  },
  imageContainer: {
    marginBottom: isSmallDevice ? 20 : isTablet ? 40 : 30,
    zIndex: 5,
  },
  emojiCircle: {
    width: isTablet ? 220 : isSmallDevice ? 160 : 180,
    height: isTablet ? 220 : isSmallDevice ? 160 : 180,
    borderRadius: isTablet ? 110 : isSmallDevice ? 80 : 90,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 4,
    shadowColor: '#e67e22',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  mainEmoji: {
    fontSize: isTablet ? 100 : isSmallDevice ? 70 : 80,
  },
  textContainer: {
    alignItems: 'center',
    width: '100%',
    zIndex: 5,
  },
  title: {
    fontSize: isTablet ? 36 : isSmallDevice ? 24 : 28,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: isSmallDevice ? 6 : 8,
    paddingHorizontal: 10,
  },
  subtitle: {
    fontSize: isTablet ? 20 : isSmallDevice ? 15 : 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: isSmallDevice ? 10 : 14,
  },
  description: {
    fontSize: isTablet ? 18 : isSmallDevice ? 14 : 15,
    color: '#B0B0B0',
    textAlign: 'center',
    lineHeight: isSmallDevice ? 20 : 24,
    marginBottom: isSmallDevice ? 16 : 24,
    paddingHorizontal: isTablet ? 40 : 10,
  },
  featuresContainer: {
    alignSelf: 'stretch',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: isTablet ? 24 : isSmallDevice ? 14 : 18,
    borderLeftWidth: 4,
    maxWidth: isTablet ? 500 : '100%',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: isSmallDevice ? 8 : 12,
  },
  featureDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
    flexShrink: 0,
  },
  featureText: {
    fontSize: isTablet ? 17 : isSmallDevice ? 13 : 15,
    color: '#FFFFFF',
    fontWeight: '700',
    flex: 1,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: isSmallDevice ? 12 : 16,
  },
  dot: {
    height: 10,
    borderRadius: 5,
    marginHorizontal: 4,
  },
  bottomContainer: {
    paddingHorizontal: isTablet ? 60 : 24,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: 14,
    paddingHorizontal: isTablet ? 40 : 24,
  },
  skipText: {
    fontSize: isTablet ? 18 : 16,
    color: '#808080',
    fontWeight: '700',
  },
  nextButton: {
    backgroundColor: '#e67e22',
    paddingVertical: isTablet ? 18 : 16,
    paddingHorizontal: isTablet ? 50 : 40,
    borderRadius: 30,
    shadowColor: '#e67e22',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  nextText: {
    color: '#000000',
    fontSize: isTablet ? 18 : 16,
    fontWeight: '900',
  },
  getStartedButton: {
    backgroundColor: '#9B5DE5',
    paddingVertical: isTablet ? 22 : 18,
    borderRadius: 30,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#9B5DE5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 10,
  },
  getStartedText: {
    color: '#000000',
    fontSize: isTablet ? 20 : 18,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  legalContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: isSmallDevice ? 12 : 16,
    paddingHorizontal: 10,
  },
  legalText: {
    fontSize: isTablet ? 12 : isSmallDevice ? 10 : 11,
    color: '#666666',
    textAlign: 'center',
  },
  legalLink: {
    fontSize: isTablet ? 12 : isSmallDevice ? 10 : 11,
    color: '#9B5DE5',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});

export default OnboardingScreen;