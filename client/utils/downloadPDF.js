import * as FileSystem from 'expo-file-system';

export const downloadPdf = async (url, filename) => {
  try {
    const fileUri = FileSystem.documentDirectory + filename;
    const downloadResult = await FileSystem.downloadAsync(url, fileUri);

    if (downloadResult.status === 200) {
      console.log('File downloaded successfully!');
      return fileUri;
    } else {
      console.error('Download failed, status:', downloadResult.status);
      return null;
    }
  } catch (error) {
    console.error('Error downloading file:', error);
    return null;
  }
};
