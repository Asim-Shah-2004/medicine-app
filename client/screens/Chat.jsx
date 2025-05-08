import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Animated,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import Markdown from 'react-native-markdown-display';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_URL } from '@env';

const MedChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [displayText, setDisplayText] = useState('');
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  const scrollViewRef = useRef();
  const recordingRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const typingAnim = useRef(new Animated.Value(0)).current;

  // Initial animation and keyboard event listeners
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
    
    // Set up keyboard listeners
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => setKeyboardHeight(e.endCoordinates.height)
    );
    
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    
    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  // Animate typing dots
  useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(typingAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(typingAnim, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      typingAnim.setValue(0);
    }
  }, [isLoading]);

  // Typewriter effect for bot messages
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].sender === 'bot') {
      const botMessage = messages[messages.length - 1].text || '';
      if (currentMessageIndex < botMessage.length) {
        const timeout = setTimeout(() => {
          setDisplayText(botMessage.substring(0, currentMessageIndex + 1));
          setCurrentMessageIndex(currentMessageIndex + 1);
        }, 15); // Speed of typing
        return () => clearTimeout(timeout);
      }
    }
  }, [currentMessageIndex, messages]);

  // Reset currentMessageIndex when a new bot message arrives
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].sender === 'bot') {
      setDisplayText('');
      setCurrentMessageIndex(0);
    }
  }, [messages]);

  const sendMessage = async () => {
    if (inputText.trim() === '') return;
    
    // Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMessage = { id: Date.now(), text: inputText, sender: 'user' };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      // Get access token from AsyncStorage
      const accessToken = await AsyncStorage.getItem('accessToken');
      
      const response = await fetch(`${SERVER_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ prompt: inputText }),
      });

      const data = await response.json();
      
      setIsLoading(false);
      setMessages(prevMessages => [
        ...prevMessages,
        { id: Date.now(), text: data.response, sender: 'bot' }
      ]);
    } catch (error) {
      console.error('Error sending message:', error);
      setIsLoading(false);
      setMessages(prevMessages => [
        ...prevMessages,
        { id: Date.now(), text: "Sorry, I'm having trouble connecting right now. Please try again later.", sender: 'bot' }
      ]);
    }
  };

  // Scroll to bottom when new messages arrive or keyboard shows/hides
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, displayText, keyboardHeight]);

  const startRecording = async () => {
    try {
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to access microphone is required!');
        return;
      }

      // Start recording
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await recording.startAsync();
      recordingRef.current = recording;
    } catch (error) {
      console.error('Failed to start recording', error);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    
    try {
      setIsRecording(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      
      // Process the recording with a speech-to-text service
      processVoiceToText(uri);
    } catch (error) {
      console.error('Failed to stop recording', error);
    }
  };

  const processVoiceToText = async (audioUri) => {
    // This is where you would connect to a speech-to-text service
    // For now, we'll simulate it with a placeholder text
    setIsLoading(true);
    
    // Simulating API call delay
    setTimeout(() => {
      setInputText("What are the common symptoms of diabetes?"); // Example text
      setIsLoading(false);
    }, 1500);
    
    // In a real implementation, you would:
    // 1. Send the audio file to a speech-to-text service
    // 2. Get the transcribed text back
    // 3. Set it as the input text
  };

  const renderLoadingBubbles = () => (
    <View style={styles.botBubble}>
      <View style={styles.botIconContainer}>
        <Ionicons name="medkit" size={20} color="#FF7F50" />
      </View>
      <Animated.View 
        style={[
          styles.loadingContainer,
          { opacity: typingAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.5, 1]
          }) }
        ]}
      >
        <View style={styles.loadingBubble} />
        <View style={[styles.loadingBubble, { marginLeft: 4 }]} />
        <View style={[styles.loadingBubble, { marginLeft: 4 }]} />
      </Animated.View>
    </View>
  );

  const renderMessage = (message, index) => {
    if (!message) return null;
    
    const isLastBotMessage = 
      message.sender === 'bot' && 
      index === messages.length - 1;

    return (
      <View
        key={message.id}
        style={[
          styles.messageBubble,
          message.sender === 'user'
            ? styles.userBubble
            : styles.botBubble,
        ]}
      >
        {message.sender === 'bot' && (
          <View style={styles.botIconContainer}>
            <Ionicons name="medkit" size={20} color="#FF7F50" />
          </View>
        )}
        <View style={styles.messageContent}>
          {message.sender === 'bot' && isLastBotMessage ? (
            <Markdown style={markdownStyles}>
              {displayText || ''}
            </Markdown>
          ) : (
            <Markdown style={markdownStyles}>
              {message.text || ''}
            </Markdown>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <Animated.View 
          style={[
            styles.header, 
            { transform: [{ translateY: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [-50, 0]
            }) }] }
          ]}
        >
          <View style={styles.headerContent}>
            <Ionicons name="medkit" size={24} color="#FF7F50" />
            <Text style={styles.headerTitle}>MedChat Assistant</Text>
          </View>
        </Animated.View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={[
            styles.messagesContent,
            { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 100 : 20 }
          ]}
          showsVerticalScrollIndicator={false}
        >
          {messages && messages.length === 0 ? (
            <Animated.View 
              style={[
                styles.emptyStateContainer,
                { opacity: slideAnim }
              ]}
            >
              <Ionicons name="chatbubbles-outline" size={70} color="#FF7F50" />
              <Text style={styles.emptyStateTitle}>Welcome to MedChat</Text>
              <Text style={styles.emptyStateText}>
                Ask me any medical questions. I'm here to help!
              </Text>
            </Animated.View>
          ) : (
            messages && messages.map(renderMessage)
          )}
          {isLoading && renderLoadingBubbles()}
        </ScrollView>

        <Animated.View 
          style={[
            styles.inputContainer,
            { transform: [{ translateY: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [50, 0]
            }) }] }
          ]}
        >
          <TextInput
            style={styles.input}
            placeholder="Type your question..."
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <TouchableOpacity
            style={styles.sendButton}
            onPress={sendMessage}
            disabled={inputText.trim() === '' || isLoading}
          >
            <Ionicons
              name="send"
              size={20}
              color={inputText.trim() === '' || isLoading ? '#ccc' : 'white'}
            />
          </TouchableOpacity>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[
                styles.micButton,
                isRecording && styles.recordingButton,
              ]}
              onPressIn={startRecording}
              onPressOut={stopRecording}
            >
              <Ionicons
                name={isRecording ? "mic" : "mic-outline"}
                size={20}
                color={isRecording ? 'white' : '#FF7F50'}
              />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  keyboardAvoid: {
    flex: 1,
    position: 'relative',
  },
  header: {
    backgroundColor: 'white',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    marginLeft: 10,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  messagesContainer: {
    flex: 1,
    paddingHorizontal: 15,
  },
  messagesContent: {
    paddingTop: 20,
    paddingBottom: 10,
  },
  messageBubble: {
    marginBottom: 12,
    borderRadius: 18,
    padding: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    // Remove maxWidth to allow bubbles to size according to content
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#FF7F50',
    maxWidth: '80%', // Limit maximum width but allow shrinking
  },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F8F8F8',
    flexDirection: 'row',
    maxWidth: '85%', // Limit maximum width but allow shrinking
  },
  botIconContainer: {
    marginRight: 8,
    alignSelf: 'flex-start',
  },
  messageContent: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    // Make sure input stays at bottom regardless of keyboard
    position: Platform.OS === 'ios' ? 'relative' : 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  input: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#FF7F50',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  micButton: {
    backgroundColor: '#fff',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF7F50',
  },
  recordingButton: {
    backgroundColor: '#FF7F50',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  loadingBubble: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF7F50',
    opacity: 0.7,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    maxWidth: '80%',
  },
});

const markdownStyles = {
  body: {
    color: '#333',
    fontSize: 15,
  },
  heading1: {
    fontSize: 20,
    marginTop: 8,
    marginBottom: 8,
    fontWeight: 'bold',
    color: '#222',
  },
  heading2: {
    fontSize: 18,
    marginTop: 8,
    marginBottom: 8,
    fontWeight: 'bold',
    color: '#333',
  },
  link: {
    color: '#FF7F50',
    textDecorationLine: 'underline',
  },
  list_item: {
    marginBottom: 6,
  },
  bullet_list: {
    marginVertical: 8,
  },
  paragraph: {
    marginVertical: 8,
  },
  strong: {
    fontWeight: 'bold',
    color: '#FF7F50',
  },
  em: {
    fontStyle: 'italic',
  },
  blockquote: {
    backgroundColor: '#f9f9f9',
    borderLeftWidth: 4,
    borderLeftColor: '#FF7F50',
    paddingLeft: 12,
    paddingVertical: 8,
    marginVertical: 8,
  },
};

export default MedChat;