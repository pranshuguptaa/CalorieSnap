// App.js
import React from 'react';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { store } from './store';
import HomeScreen from './screens/HomeScreen';
import CameraScreen from './screens/CameraScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <Provider store={store}>
      <PaperProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'CalorieSnap' }} />
            <Stack.Screen name="Camera" component={CameraScreen} options={{ title: 'Take Photo' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </PaperProvider>
    </Provider>
  );
}

// store/index.js
import { configureStore } from '@reduxjs/toolkit';
import foodEntriesReducer from './foodEntriesSlice';

export const store = configureStore({
  reducer: {
    foodEntries: foodEntriesReducer,
  },
});

// store/foodEntriesSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { API_URL, API_KEY } from '../config';

export const fetchFoodEntries = createAsyncThunk(
  'foodEntries/fetchEntries',
  async (userId) => {
    const response = await fetch(`${API_URL}/db`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        appSlug: 'CalorieSnap',
        action: 'read',
        table: 'food_entries'
      })
    });
    const data = await response.json();
    return data.data;
  }
);

const foodEntriesSlice = createSlice({
  name: 'foodEntries',
  initialState: {
    entries: [],
    loading: false,
    error: null
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchFoodEntries.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchFoodEntries.fulfilled, (state, action) => {
        state.loading = false;
        state.entries = action.payload;
      })
      .addCase(fetchFoodEntries.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  },
});

export default foodEntriesSlice.reducer;

// screens/HomeScreen.js
import React, { useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { Button, Card, Title, Paragraph, ActivityIndicator } from 'react-native-paper';
import { fetchFoodEntries } from '../store/foodEntriesSlice';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HomeScreen({ navigation }) {
  const dispatch = useDispatch();
  const { entries, loading } = useSelector(state => state.foodEntries);
  const [userId, setUserId] = React.useState(null);

  useEffect(() => {
    initializeUser();
  }, []);

  const initializeUser = async () => {
    let id = await AsyncStorage.getItem('userId');
    if (!id) {
      id = 'user_' + Math.random().toString(36).substr(2, 9);
      await AsyncStorage.setItem('userId', id);
    }
    setUserId(id);
    dispatch(fetchFoodEntries(id));
  };

  const calculateTotalCalories = () => {
    const today = new Date().toDateString();
    return entries.reduce((total, entry) => {
      const entryDate = new Date(entry.data.timestamp).toDateString();
      return entryDate === today ? total + entry.data.calories : total;
    }, 0);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <Card style={{ margin: 16 }}>
        <Card.Content>
          <Title>Today's Summary</Title>
          <Paragraph style={{ textAlign: 'center', fontSize: 32, color: '#1e88e5' }}>
            {calculateTotalCalories()}
          </Paragraph>
          <Paragraph style={{ textAlign: 'center' }}>Total Calories</Paragraph>
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={() => navigation.navigate('Camera')}
        style={{ margin: 16 }}
      >
        Add Food
      </Button>

      <ScrollView>
        {loading ? (
          <ActivityIndicator />
        ) : (
          entries.map((entry, index) => (
            <Card key={index} style={{ margin: 8 }}>
              <Card.Cover source={{ uri: entry.data.photoUrl }} />
              <Card.Content>
                <Paragraph>{entry.data.description}</Paragraph>
                <Paragraph style={{ marginTop: 8 }}>
                  {new Date(entry.data.timestamp).toLocaleString()}
                </Paragraph>
                <Paragraph style={{ fontWeight: 'bold' }}>
                  {entry.data.calories} calories
                </Paragraph>
              </Card.Content>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// screens/CameraScreen.js
import React, { useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Camera } from 'expo-camera';
import { Button, ActivityIndicator } from 'react-native-paper';
import * as ImageManipulator from 'expo-image-manipulator';
import { API_URL, API_KEY } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function CameraScreen({ navigation }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [loading, setLoading] = useState(false);
  const cameraRef = useRef(null);

  React.useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const takePicture = async () => {
    if (cameraRef.current) {
      setLoading(true);
      try {
        const photo = await cameraRef.current.takePictureAsync();
        const resizedPhoto = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 1000 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        
        await processImage(resizedPhoto.uri);
        navigation.goBack();
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
  };

  const processImage = async (uri) => {
    const userId = await AsyncStorage.getItem('userId');
    
    // Create form data for image upload
    const formData = new FormData();
    formData.append('file', {
      uri,
      type: 'image/jpeg',
      name: 'food.jpg',
    });
    formData.append('userId', userId);
    formData.append('appSlug', 'CalorieSnap');

    // Upload image
    const uploadResponse = await fetch(`${API_URL}/storage/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: formData
    });
    const uploadResult = await uploadResponse.json();

    // Analyze with AI
    const aiResponse = await fetch(`${API_URL}/ai`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What food items are in this image? Please estimate portion sizes and calories.'
            },
            {
              type: 'image_url',
              image_url: {
                url: uploadResult.url
              }
            }
          ]
        }]
      })
    });
    const aiResult = await aiResponse.json();

    // Save entry
    await fetch(`${API_URL}/db`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        appSlug: 'CalorieSnap',
        action: 'create',
        table: 'food_entries',
        data: {
          photoUrl: uploadResult.url,
          description: aiResult.message,
          timestamp: new Date().toISOString(),
          calories: extractCalories(aiResult.message)
        }
      })
    });
  };

  const extractCalories = (aiMessage) => {
    const match = aiMessage.match(/(\d+)\s*calories/i);
    return match ? parseInt(match[1]) : 0;
  };

  if (hasPermission === null) {
    return <View />;
  }
  if (hasPermission === false) {
    return <Text>No access to camera</Text>;
  }

  return (
    <View style={styles.container}>
      <Camera style={styles.camera} ref={cameraRef} type={Camera.Constants.Type.back}>
        <View style={styles.buttonContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#ffffff" />
          ) : (
            <>
              <Button mode="contained" onPress={takePicture}>
                Take Photo
              </Button>
              <Button mode="contained" onPress={() => navigation.goBack()}>
                Cancel
              </Button>
            </>
          )}
        </View>
      </Camera>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'center',
    margin: 20,
  },
});
