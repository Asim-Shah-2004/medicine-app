// MediChat.js
import React, { useState, useEffect, useRef } from 'react';
import { 
  SafeAreaView, 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Animated,
  ScrollView,
  Linking
} from 'react-native';
import {SERVER_URL} from "@env"
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, FontAwesome, MaterialIcons } from '@expo/vector-icons';
// Import markdown parser
import Markdown, { MarkdownIt } from 'react-native-markdown-display';

// API Configuration
const API_URL = `${SERVER_URL}/api`;

// Typing indicator component with animated dots
const TypingIndicator = () => {
  // Animation values for opacity and scale
  const dot1Opacity = useRef(new Animated.Value(0.4)).current;
  const dot2Opacity = useRef(new Animated.Value(0.4)).current;
  const dot3Opacity = useRef(new Animated.Value(0.4)).current;
  
  const dot1Scale = useRef(new Animated.Value(1)).current;
  const dot2Scale = useRef(new Animated.Value(1)).current;
  const dot3Scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Animation function for each dot
    const animateDot = (dotOpacity, dotScale, delay) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(dotOpacity, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(dotScale, {
              toValue: 1.2,
              duration: 500,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(dotOpacity, {
              toValue: 0.4,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(dotScale, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    };

    // Start animations with different delays
    animateDot(dot1Opacity, dot1Scale, 0);
    animateDot(dot2Opacity, dot2Scale, 150);
    animateDot(dot3Opacity, dot3Scale, 300);

    // Cleanup animations when component unmounts
    return () => {
      dot1Opacity.stopAnimation();
      dot2Opacity.stopAnimation();
      dot3Opacity.stopAnimation();
      dot1Scale.stopAnimation();
      dot2Scale.stopAnimation();
      dot3Scale.stopAnimation();
    };
  }, []);

  return (
    <View style={styles.botTypingContainer}>
      <Animated.View 
        style={[
          styles.botTypingDot, 
          { opacity: dot1Opacity, transform: [{ scale: dot1Scale }] }
        ]} 
      />
      <Animated.View 
        style={[
          styles.botTypingDot, 
          { opacity: dot2Opacity, transform: [{ scale: dot2Scale }] }
        ]} 
      />
      <Animated.View 
        style={[
          styles.botTypingDot, 
          { opacity: dot3Opacity, transform: [{ scale: dot3Scale }] }
        ]} 
      />
    </View>
  );
};

const MediChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(null);
  const [botTyping, setBotTyping] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    // Get token from AsyncStorage on component mount
    const getToken = async () => {
      try {
        const savedToken = await AsyncStorage.getItem('accessToken');
        if (savedToken) {
          setToken(savedToken);
        }
      } catch (error) {
        console.error('Error retrieving token:', error);
      }
    };
    
    getToken();
  }, []);

  // Variable for minimum typing time based on response length
  const getTypingDelay = (text) => {
    const baseDelay = 800;
    const wordsPerMinute = 600; // Bot "typing" speed
    const wordCount = text.split(/\s+/).length;
    const readingTime = (wordCount / wordsPerMinute) * 60 * 1000;
    
    // Cap at reasonable maximums and minimums
    return Math.min(Math.max(baseDelay, readingTime), 3000);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !token) return;
    
    const userMessage = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputText('');
    setLoading(true);
    setBotTyping(true);
    
    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: userMessage.text,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Pre-process response text to enhance markdown formatting
        let enhancedResponse = data.response;
        
        // Add section highlighting for better readability
        // e.g., transform "Symptoms:" into "## Symptoms:"
        const medicalSections = ['Symptoms:', 'Treatment:', 'Causes:', 'Diagnosis:', 'Prevention:', 'Side Effects:', 'Dosage:'];
        medicalSections.forEach(section => {
          // Only add ## if it's not already a markdown heading
          const regex = new RegExp(`(?<!#)\\s*${section}\\s*(?!#)`, 'g');
          enhancedResponse = enhancedResponse.replace(regex, `\n## ${section}\n`);
        });
        
        // Add blockquote formatting for important warnings
        const importantNotes = ['Note:', 'Important:', 'Warning:', 'Caution:', 'Remember:'];
        importantNotes.forEach(note => {
          const regex = new RegExp(`${note}\\s*(.+?)(?=\\n\\n|$)`, 'gs');
          enhancedResponse = enhancedResponse.replace(regex, `> ${note} $1`);
        });
        
        // Calculate a realistic typing delay based on response length
        const typingDelay = getTypingDelay(enhancedResponse);
        
        // Show typing indicator for a realistic amount of time
        setTimeout(() => {
          const botMessage = {
            id: (Date.now() + 1).toString(),
            text: enhancedResponse,
            sender: 'bot',
            timestamp: new Date().toISOString(),
          };
          
          setMessages(prevMessages => [...prevMessages, botMessage]);
          setLoading(false);
          setBotTyping(false);
        }, typingDelay);
      } else {
        // Handle API error with a shorter delay
        setTimeout(() => {
          const errorMessage = {
            id: (Date.now() + 1).toString(),
            text: data.message || 'Sorry, I encountered an error processing your request.',
            sender: 'bot',
            error: true,
            timestamp: new Date().toISOString(),
          };
          
          setMessages(prevMessages => [...prevMessages, errorMessage]);
          setLoading(false);
          setBotTyping(false);
        }, 800);
      }
      
    } catch (error) {
      console.error('Send message error:', error);
      setTimeout(() => {
        const errorMessage = {
          id: (Date.now() + 1).toString(),
          text: 'Network error. Please check your connection and try again.',
          sender: 'bot',
          error: true,
          timestamp: new Date().toISOString(),
        };
        
        setMessages(prevMessages => [...prevMessages, errorMessage]);
        setLoading(false);
        setBotTyping(false);
      }, 800);
    }
  };

  // Custom markdown styling with enhanced formatting
  const markdownStyles = {
    // Base text styling
    body: {
      color: '#333',
      fontSize: 15,
      lineHeight: 22,
    },
    
    // Headings with improved hierarchy and spacing
    heading1: {
      fontSize: 20,
      fontWeight: 'bold',
      marginTop: 14,
      marginBottom: 8,
      color: '#FF7F50',
      borderBottomWidth: 1,
      borderBottomColor: '#FFE5DC',
      paddingBottom: 5,
    },
    heading2: {
      fontSize: 18,
      fontWeight: 'bold',
      marginTop: 12,
      marginBottom: 6,
      color: '#FF7F50',
    },
    heading3: {
      fontSize: 16,
      fontWeight: 'bold',
      marginTop: 10,
      marginBottom: 5,
      color: '#333',
    },
    heading4: {
      fontSize: 15,
      fontWeight: 'bold',
      marginTop: 8,
      marginBottom: 4,
      color: '#555',
      fontStyle: 'italic',
    },
    
    // Enhanced link styling
    link: {
      color: '#FF7F50',
      textDecorationLine: 'underline',
      fontWeight: '500',
    },
    
    // Improved blockquote for important medical notes/warnings
    blockquote: {
      borderLeftWidth: 4,
      borderLeftColor: '#FF7F50',
      backgroundColor: '#FFECE7',
      paddingLeft: 12,
      paddingRight: 8,
      paddingTop: 6,
      paddingBottom: 6,
      marginLeft: 0,
      marginVertical: 10,
      borderRadius: 0,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 4,
    },
    
    // Enhanced list styling
    list_item: {
      marginBottom: 6,
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    bullet_list: {
      marginVertical: 8,
    },
    ordered_list: {
      marginVertical: 8,
    },
    bullet_list_icon: {
      marginRight: 6,
      fontSize: 15,
      lineHeight: 22,
      color: '#FF7F50',
    },
    ordered_list_icon: {
      marginRight: 6,
      fontSize: 15,
      lineHeight: 22,
      color: '#FF7F50',
      fontWeight: '500',
    },
    
    // Text styling
    paragraph: {
      marginVertical: 8,
    },
    strong: {
      fontWeight: 'bold',
      color: '#333',
    },
    em: {
      fontStyle: 'italic',
      color: '#444',
    },
    
    // Medical terms and important notes
    code_inline: {
      backgroundColor: '#FFE5DC',
      borderRadius: 3,
      paddingHorizontal: 4,
      paddingVertical: 1,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      color: '#D55C30',
      fontWeight: '500',
    },
    
    // Code blocks for medical reference data
    code_block: {
      backgroundColor: '#F8F8F8',
      padding: 10,
      borderRadius: 6,
      borderLeftWidth: 3,
      borderLeftColor: '#FF7F50',
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      marginVertical: 10,
      fontSize: 14,
    },
    
    // Table styles for medical data
    table: {
      borderWidth: 1,
      borderColor: '#ddd',
      borderRadius: 6,
      marginVertical: 10,
      overflow: 'hidden',
    },
    thead: {
      backgroundColor: '#FF7F50',
    },
    th: {
      padding: 8,
      fontWeight: 'bold',
      color: 'white',
    },
    tbody: {
      backgroundColor: 'white',
    },
    tr: {
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
    },
    td: {
      padding: 8,
      borderRightWidth: 1,
      borderRightColor: '#eee',
    },
    
    // Horizontal rule for section separation
    hr: {
      backgroundColor: '#FFE5DC',
      height: 2,
      marginVertical: 14,
    },
    
    // Image styling
    image: {
      marginVertical: 10,
      borderRadius: 6,
    },
    
    // Definition styles for medical terms
    s: { // Using strikethrough tag as custom container for definitions
      backgroundColor: '#F0F7FF',
      padding: 10,
      borderRadius: 6,
      borderLeftWidth: 3,
      borderLeftColor: '#6495ED',
      marginVertical: 8,
    }
  };

  // Create custom Markdown renderer with plugins
  const markdownItInstance = MarkdownIt({
    typographer: true,
    breaks: true,
    linkify: true
  });
  
  // Custom markdown renderer rules
  const renderRules = {
    // Custom handler for links
    link: (node, children, parent, styles, inheritedStyles) => {
      return (
        <TouchableOpacity 
          key={node.key} 
          onPress={() => Linking.openURL(node.attributes.href)}
          style={styles.link}
        >
          <Text style={styles.link}>
            {children || node.content || node.attributes.href}
            <Text> </Text>
            <FontAwesome name="external-link" size={12} color="#FF7F50" />
          </Text>
        </TouchableOpacity>
      );
    },
    // Custom handler for blockquotes to add icons for notes/warnings
    blockquote: (node, children, parent, styles) => {
      return (
        <View key={node.key} style={styles.blockquote}>
          <View style={styles.blockquoteIconContainer}>
            <MaterialIcons name="info-outline" size={20} color="#FF7F50" />
          </View>
          <View style={styles.blockquoteContent}>
            {children}
          </View>
        </View>
      );
    },
    // Add timestamp to messages
    text: (node, parent, styles, inheritedStyles) => {
      // Normal text rendering for most cases
      return (
        <Text key={node.key} style={inheritedStyles}>
          {node.content}
        </Text>
      );
    }
  };

  // Format timestamp for display
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Render message with enhanced markdown for bot responses
  const renderMessage = ({ item }) => (
    <View style={styles.messageContainer}>
      <View 
        style={[
          styles.messageBubble, 
          item.sender === 'user' ? styles.userBubble : styles.botBubble,
          item.error && styles.errorBubble
        ]}
      >
        {item.sender === 'user' ? (
          <Text style={styles.userMessageText}>
            {item.text}
          </Text>
        ) : (
          <Markdown 
            style={markdownStyles}
            rules={renderRules}
            markdownit={markdownItInstance}
          >
            {item.text}
          </Markdown>
        )}
      </View>
      <Text style={[
        styles.messageTimestamp,
        item.sender === 'user' ? styles.userTimestamp : styles.botTimestamp
      ]}>
        {formatTime(item.timestamp)}
      </Text>
    </View>
  );

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Ionicons name="medical" size={24} color="#FF7F50" />
          <Text style={styles.headerTitle}>MediChat</Text>
        </View>
      </View>
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.chatContainer}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {messages.length === 0 ? (
          <View style={styles.welcomeContainer}>
            <Ionicons name="chatbubble-ellipses-outline" size={64} color="#FF7F50" />
            <Text style={styles.welcomeTitle}>Welcome to MediChat</Text>
            <Text style={styles.welcomeText}>
              Ask me any medical questions you have, and I'll provide helpful information
              with citations to reliable sources.
            </Text>
            <Text style={styles.welcomeSubText}>
              Responses support markdown formatting including:
            </Text>
            <View style={styles.markdownExampleContainer}>
              <Text style={styles.markdownExample}>• Headings: # Heading</Text>
              <Text style={styles.markdownExample}>• Bold: **text**</Text>
              <Text style={styles.markdownExample}>• Lists: - item or 1. item</Text>
              <Text style={styles.markdownExample}>• Links: [text](url)</Text>
            </View>
            <Text style={styles.disclaimerText}>
              Note: This is for informational purposes only and not a substitute for 
              professional medical advice.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={() => botTyping ? <TypingIndicator /> : null}
          />
        )}
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type your medical question..."
            multiline
          />
          <TouchableOpacity 
            style={[
              styles.sendButton,
              (!inputText.trim() || !token || loading) && styles.sendButtonDisabled
            ]} 
            onPress={sendMessage}
            disabled={loading || !inputText.trim() || !token}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#FF7F50',
  },
  chatContainer: {
    flex: 1,
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FF7F50',
    marginTop: 16,
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
    color: '#333',
  },
  welcomeSubText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
    color: '#444',
    fontWeight: '500',
  },
  markdownExampleContainer: {
    backgroundColor: '#FFECE7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#FFD7CB',
  },
  markdownFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureIcon: {
    marginRight: 10,
    width: 20,
    alignItems: 'center',
  },
  markdownExample: {
    fontSize: 14,
    color: '#444',
    flex: 1,
  },
  disclaimerText: {
    fontSize: 12,
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 24,
  },
  messageContainer: {
    marginBottom: 16,
    width: '100%',
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userBubble: {
    backgroundColor: '#FF7F50',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  errorBubble: {
    backgroundColor: '#FFEDED',
    borderLeftWidth: 3,
    borderLeftColor: '#FF6666',
  },
  userMessageText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 22,
  },
  messageTimestamp: {
    fontSize: 11,
    marginTop: 4,
    color: '#888',
  },
  userTimestamp: {
    alignSelf: 'flex-end',
    marginRight: 4,
  },
  botTimestamp: {
    alignSelf: 'flex-start',
    marginLeft: 4,
  },
  blockquoteIconContainer: {
    marginRight: 8,
    alignSelf: 'flex-start',
    paddingTop: 2,
  },
  blockquoteContent: {
    flex: 1,
  },
  botTypingContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
    alignSelf: 'flex-start',
    marginBottom: 12,
    width: 70,
    justifyContent: 'center',
  },
  botTypingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#888',
    marginHorizontal: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#FF7F50',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#FFB199',
  }
});

export default MediChat;