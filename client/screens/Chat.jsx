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
  ScrollView
} from 'react-native';
import {SERVER_URL} from "@env"
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
// Import markdown parser
import Markdown from 'react-native-markdown-display';

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
      
      // Short delay to show typing indicator
      setTimeout(() => {
        if (response.ok) {
          const botMessage = {
            id: (Date.now() + 1).toString(),
            text: data.response,
            sender: 'bot',
            timestamp: new Date().toISOString(),
          };
          
          setMessages(prevMessages => [...prevMessages, botMessage]);
        } else {
          // Handle API error
          const errorMessage = {
            id: (Date.now() + 1).toString(),
            text: data.message || 'Sorry, I encountered an error processing your request.',
            sender: 'bot',
            error: true,
            timestamp: new Date().toISOString(),
          };
          
          setMessages(prevMessages => [...prevMessages, errorMessage]);
        }
        
        setLoading(false);
        setBotTyping(false);
      }, 800);
      
    } catch (error) {
      console.error('Send message error:', error);
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
    }
  };

  // Custom markdown styling
  const markdownStyles = {
    body: {
      color: '#333',
    },
    heading1: {
      fontSize: 20,
      fontWeight: 'bold',
      marginTop: 10,
      marginBottom: 5,
      color: '#333',
    },
    heading2: {
      fontSize: 18,
      fontWeight: 'bold',
      marginTop: 8,
      marginBottom: 4,
      color: '#333',
    },
    heading3: {
      fontSize: 16,
      fontWeight: 'bold',
      marginTop: 6,
      marginBottom: 3,
      color: '#333',
    },
    link: {
      color: '#FF7F50',
      textDecorationLine: 'underline',
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: '#FF7F50',
      paddingLeft: 10,
      marginLeft: 10,
      fontStyle: 'italic',
      color: '#555',
    },
    list_item: {
      marginBottom: 5,
    },
    bullet_list: {
      marginVertical: 5,
    },
    ordered_list: {
      marginVertical: 5,
    },
    strong: {
      fontWeight: 'bold',
    },
    em: {
      fontStyle: 'italic',
    },
    code_inline: {
      backgroundColor: '#f5f5f5',
      padding: 2,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    code_block: {
      backgroundColor: '#f5f5f5',
      padding: 8,
      borderRadius: 4,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      marginVertical: 10,
    },
    hr: {
      backgroundColor: '#ddd',
      height: 1,
      marginVertical: 10,
    },
  };

  // Render message with markdown for bot responses
  const renderMessage = ({ item }) => (
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
        <Markdown style={markdownStyles}>
          {item.text}
        </Markdown>
      )}
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
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
    color: '#555',
  },
  markdownExampleContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  markdownExample: {
    fontSize: 13,
    color: '#555',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
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
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: '#FF7F50',
    alignSelf: 'flex-end',
  },
  botBubble: {
    backgroundColor: '#f0f0f0',
    alignSelf: 'flex-start',
  },
  errorBubble: {
    backgroundColor: '#ffeded',
  },
  userMessageText: {
    fontSize: 15,
    color: '#fff',
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