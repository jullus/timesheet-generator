import * as keytar from 'keytar';
import * as readline from 'readline';

export class SecretsManager {
  static SERVICE_PREFIX = 'ggts_';

  static async getToken(provider: string): Promise<string> {
    const serviceName = `${this.SERVICE_PREFIX}${provider}`;
    let token = await keytar.getPassword(serviceName, 'user');
    
    if (!token) {
      console.log(`Token for ${provider} not found.`);
      token = await this.promptPassword(`Enter Personal Access Token for ${provider}: `);
      await keytar.setPassword(serviceName, 'user', token);
    }
    
    return token;
  }

  static async setToken(provider: string, token: string): Promise<void> {
    const serviceName = `${this.SERVICE_PREFIX}${provider}`;
    await keytar.setPassword(serviceName, 'user', token);
  }

  static async clearToken(provider: string): Promise<void> {
    const serviceName = `${this.SERVICE_PREFIX}${provider}`;
    await keytar.deletePassword(serviceName, 'user');
  }

  private static promptPassword(query: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise(resolve => rl.question(query, (ans: string) => {
      rl.close();
      resolve(ans);
    }));
  }
}
