import React, { useState } from 'react';
import { Text, View, TextInput, Button } from 'react-native';
import { generateSalt, deriveKey, encrypt, decrypt, encodeBase64 } from '@mypass/shared-crypto';

export default function App() {
  const [password, setPassword] = useState('');
  const [plaintext, setPlaintext] = useState('My secret');
  const [result, setResult] = useState('');

  async function onEncrypt() {
    const salt = await generateSalt();
    const key = await deriveKey(password, salt);
    const { ciphertext, iv } = await encrypt(plaintext, key);
    setResult(`salt:${encodeBase64(salt)} iv:${iv} ct:${ciphertext}`);
  }

  return (
    <View style={{flex:1,padding:20,justifyContent:'center'}}>
      <Text>Demo MyPass (mobile)</Text>
      <TextInput placeholder="Master password" secureTextEntry value={password} onChangeText={setPassword} style={{borderWidth:1,marginVertical:10,padding:8}} />
      <TextInput placeholder="Plaintext" value={plaintext} onChangeText={setPlaintext} style={{borderWidth:1,marginVertical:10,padding:8}} />
      <Button title="Encrypt (demo)" onPress={onEncrypt} />
      <Text selectable style={{marginTop:20}}>{result}</Text>
    </View>
  );
}
