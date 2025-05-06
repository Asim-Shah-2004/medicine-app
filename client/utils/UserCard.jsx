import { useNavigation } from '@react-navigation/native';
import { View, Text, TouchableOpacity, Image } from 'react-native';

import { connectHandler } from './connectHandler';
import { useAuth } from '../providers/AuthProvider';

const UserCard = ({ alumni }) => {
  const { _id, fullName, bio, profilePhoto } = alumni;
  const navigation = useNavigation();
  const { user, setUser, reqSet, setReqSet } = useAuth();

  const handleViewProfile = () => {
    navigation.navigate('Profile', { _id }); // Navigate to the profile with user ID
  };

  const handleConnect = async () => {
    try {
      const updatedUser = await connectHandler(_id);
      setUser(updatedUser);
      setReqSet(new Set(updatedUser.sentRequests));
    } catch (error) {
      console.error('Error connecting:', error);
    }
  };

  const truncatedBio = bio
    ? bio.length > 50
      ? bio.substring(0, 50) + '...'
      : bio
    : 'Software Engineer';

  return (
    <View className="w-48 items-center rounded-lg bg-white p-4 shadow-lg">
      {/* User Info */}
      <Image
        source={{
          uri: profilePhoto || 'https://randomuser.me/api/portraits/men/32.jpg',
        }}
        className="mb-3 h-16 w-16 rounded-full"
      />
      <Text className="mb-1 text-center text-base font-bold text-gray-800" numberOfLines={1}>
        {fullName || 'John Doe'}
      </Text>
      <Text className="mb-4 text-center text-xs text-gray-600" numberOfLines={2}>
        {truncatedBio}
      </Text>

      {/* Action Buttons */}
      <View className="w-full space-y-2">
        <TouchableOpacity
          onPress={handleViewProfile}
          className="w-full rounded-md bg-gray-100 p-5">
          <Text className="text-center text-xs font-medium text-blue-600">View Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleConnect}
          className={`w-full rounded-md px-3 py-2 mt-2 ${reqSet.has(_id) ? 'bg-gray-400' : 'bg-blue-600'}`} // Change the background color conditionally
        >
          <Text className="text-center text-xs font-medium text-white p-2">
            {reqSet.has(_id) ? 'Pending' : 'Connect'} {/* Change text based on the condition */}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default UserCard;
