
import { Injectable } from '@angular/core';
import { LocalStorage } from './storage.service';

declare let fingerprintManager: FingerprintPlugin.FingerprintManager;
declare let passwordManager: PasswordManagerPlugin.PasswordManager;

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    public static instance: AuthService = null;

    constructor(private storage: LocalStorage) {
        AuthService.instance = this;
    }

    public async createAndSaveWalletPassword(walletId: string): Promise<string> {
        let password = await passwordManager.generateRandomPassword();

        // Save the did store password with a master password
        let passwordInfo: PasswordManagerPlugin.GenericPasswordInfo = {
            type: PasswordManagerPlugin.PasswordType.GENERIC_PASSWORD,
            key: "wallet-"+walletId,
            displayName: "Wallet password",
            password: password,
            // TODO: visible: false
        }
        let result = await passwordManager.setPasswordInfo(passwordInfo);
        if (result.value) {
            // Master password was created and wallet password could be saved
            return password;
        }
        else {
            // Cancellation, or failure
            return null;
        }
    }

    public async getWalletPassword(walletId: string, showMasterPromptIfDatabaseLocked: boolean = true, forceShowMasterPrompt: boolean = false): Promise<string> {
        return new Promise(async (resolve, reject) => {
            try {
                let options: PasswordManagerPlugin.GetPasswordInfoOptions = {
                    promptPasswordIfLocked: showMasterPromptIfDatabaseLocked,
                    forceMasterPasswordPrompt: forceShowMasterPrompt
                };

                let passwordInfo = await passwordManager.getPasswordInfo("wallet-"+walletId, options) as PasswordManagerPlugin.GenericPasswordInfo;
                if (!passwordInfo) {
                    // Master password is right, but no data for the requested key...
                    console.log("Master password was right, but no password found for the requested key")

                    resolve(null);
                }
                else {
                    // Master password was unlocked and found
                    resolve(passwordInfo.password);
                }
            }
            catch (e) {
                console.error(e);
                // TODO: better handle various kind of errors
                reject();
            }
        });
    }

    public async deleteWalletPassword(walletId: string): Promise<string> {
        return new Promise(async (resolve, reject) => {
            try {
                const resultInfo = await passwordManager.deletePasswordInfo("wallet-"+walletId) as PasswordManagerPlugin.BooleanWithReason;
                if (resultInfo) {
                    if (resultInfo.value) {
                        resolve(null);
                    } else {
                        console.error('deletePasswordInfo error:', resultInfo.reason);
                        reject(resultInfo.reason);
                    }
                } else {
                    resolve(null);
                }
            } catch (e) {
                console.error(e);
                // TODO: better handle various kind of errors
                reject();
            }
        });
    }

    /**
     * Activates fingerprint authentication instead of using a password.
     */
    /*async activateFingerprintAuthentication(walletID: string, password: string): Promise<boolean> {
        console.log('Activating fingerprint authentication for did store id ' + walletID);

        // Ask the fingerprint plugin to save user's password
        try {
            await fingerprintManager.authenticateAndSavePassword(walletID, password);
            // Password was securely saved. Now remember this user's choice in settings.
            await this.storage.set('useFingerprintAuthentication-' + walletID, true);
            return true;
        } catch (e) {
            console.log('authenticateAndSavePassword eror ', e);
            return false;
        }
    }

    async deactivateFingerprintAuthentication(walletID: string) {
        await this.storage.set('useFingerprintAuthentication-' + walletID, false);
    }

    async authenticateByFingerprintAndGetPassword(didStoreId: string) {
        // Ask the fingerprint plugin to authenticate and retrieve the password
        try {
            const password = await fingerprintManager.authenticateAndGetPassword(didStoreId);
            return password;
        } catch (e) {
            return null;
        }
    }

    async fingerprintAuthenticationEnabled(walletID: string): Promise<boolean> {
        return this.storage.get('useFingerprintAuthentication-' + walletID) || false;
    }

    async fingerprintIsAvailable() {
        try {
            let isAvailable = await fingerprintManager.isBiometricAuthenticationMethodAvailable();
            return isAvailable;
        } catch (e) {
            return false;
        }
    }*/
}
