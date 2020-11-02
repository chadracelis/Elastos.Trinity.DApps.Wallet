import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { LocalStorage } from './storage.service';
import * as TrinitySDK from "@elastosfoundation/trinity-dapp-sdk";
import { Hive } from '@elastosfoundation/trinity-dapp-sdk';
import { MasterWallet } from '../model/wallets/MasterWallet';
import { SubWallet } from '../model/wallets/SubWallet';
import { BackupRestoreHelper, BackupRestoreEntry } from '@elastosfoundation/trinity-dapp-sdk/dist/backup';
import { StandardSubWallet } from '../model/wallets/StandardSubWallet';
import { Coin, StandardCoinName } from '../model/Coin';
import { MainchainSubWallet } from '../model/wallets/MainchainSubWallet';
import moment from "moment";
import { AppService } from './app.service';
import { WalletManager } from './wallet.service';
import { Events } from '@ionic/angular';
import { CoinService } from './coin.service';
import { ResolveEnd } from '@angular/router';

declare let appManager: AppManagerPlugin.AppManager;
declare let walletManager: WalletPlugin.WalletManager;

@Injectable({
  providedIn: 'root'
})
export class BackupRestoreService {
  private static SHOW_DEBUG_LOGS = true;

  private initializationComplete = false;
  private userVault: HivePlugin.Vault = null;
  private backupRestoreHelper: BackupRestoreHelper;
  private subWalletBackupInProgress = false;
  private walletsList: MasterWallet[] = [];
  private fullySuccessfulSyncExpected = true;
  private activeNetwork: string = null; // MainNet, TestNet, PrvNet

  constructor(private http: HttpClient, private storage: LocalStorage, private appService: AppService,
    private events: Events, private coinService: CoinService) {
  }

  async init() {
    this.log("Initializing");

    await this.loadActiveNetwork();

    // Check if we have a vault already configured or not
    let userDID = await this.storage.get("backup-user-with-vault-did");
    if (userDID) {
      // DID and vault already configured - we can automatically initialize the backup mechanism.
      this.logDebug("A user DID is already configured for the backup service. Using it.", userDID);
      await this.setupBackupHelper();
    }

    this.initializationComplete = true;
  }

  public initialized(): boolean {
    return this.initializationComplete;
  }

  public vaultIsConfigured(): boolean {
    return (this.userVault != null);
  }

  /**
   * Gets and saves current blockchain network (mainnet, testnet) from the preferences.
   */
  private async loadActiveNetwork(): Promise<void> {
    return new Promise((resolve, reject)=>{
      appManager.getPreference("chain.network.type", (networkCode) => {
        this.activeNetwork = networkCode;
        resolve();
      }, (err)=>{
        reject(err);
      });
    });
  }

  // TODO: how to make it easier for all apps to connect to Hive, without opening the did app every time
  // Can we make the app did intent silent ? -> Problem: it requires master password

  /**
   * Called whenever user's hive vault is enabled in the app. From this point, we can setup the backup helper
   * and start syncing to the vault.
   */
  public async activateVaultAccess() {
    if (!this.appService.runningAsMainUI()) {
      this.logError("BackupRestoreService should be called only from the UI!");
    }

    await this.setupBackupHelper();

    // After a manual vault activation, we start a sync immediatelly, to be able to restore sync states
    // after a wallet reinstallation.
    await this.checkSync(WalletManager.instance.getWalletsList());
  }

  private ensureRunningInUI() {
    if (!this.appService.runningAsMainUI()) {
      this.logError("BackupRestoreService should be called only from the UI!");
    }
  }

  private async setupBackupHelper() {
    this.ensureRunningInUI();

    this.log("Backup helper setup starting");

    let hiveAuthHelper = new TrinitySDK.Hive.AuthHelper();
    let hiveClient = await hiveAuthHelper.getClientWithAuth();
    this.log("Got hive client. Resolving vault...", hiveClient);

    let didHelper = new TrinitySDK.DID.DIDHelper();
    let userDID = (await didHelper.getOrCreateAppIdentityCredential()).getIssuer();
    this.logDebug("Current user DID:", userDID);

    this.userVault = await hiveClient.getVault(userDID);
    if (!this.userVault) {
      this.log("No vault activated, not doing any backup");
      return false;
    }

    // Save the fact that we now have a configured vault info to use for backups
    await this.storage.set("backup-user-with-vault-did", userDID);

    this.log("Using vault for user:", this.userVault.getVaultOwnerDid(), "at:", this.userVault.getVaultProviderAddress());

    this.backupRestoreHelper = new TrinitySDK.Backup.BackupRestoreHelper(this.userVault, true);
    this.log("Backup restore helper initialized", this.backupRestoreHelper);
  }

  /**
   * In order to get a permanent wallet context key after reinstallation and across devices, we use
   * the first address of the ELA subwallet.
   *
   * A different context is used for different chain networks in order to not mix sync states from different
   * chains.
   */
  private async getWalletSyncContextName(wallet: MasterWallet): Promise<string> {
    let rootAddress = await this.getWalletFirstELAAddress(wallet);
    return "walletbackup-" + this.activeNetwork + "-" + rootAddress;
  }

  private async getWalletFirstELAAddress(wallet: MasterWallet): Promise<string> {
    // Get the ELA subwallet inside this wallet
    let elaSubWallet = wallet.getSubWallet(StandardCoinName.ELA) as MainchainSubWallet;
    return await elaSubWallet.getRootPaymentAddress();
  }

  public async setupBackupForWallet(wallet: MasterWallet) {
    this.ensureRunningInUI();

    if (!this.backupRestoreHelper) {
      // No vault / backup service initialized yet - forget this request for now.
      this.logDebug("Backup restore helper not initialized. Skipping backup setup for wallet", wallet);
      return;
    }

    this.walletsList.push(wallet);

    this.logDebug("Initializing backup sync context for wallet", wallet);

    let walletContextName = await this.getWalletSyncContextName(wallet);
    await this.backupRestoreHelper.addSyncContext(walletContextName, async (entry) => {
      // insertion
      this.logDebug("Insertion request from the backup helper", entry)
      return await this.handleRemoteBackupEntryChanged(entry);
    }, async (entry) => {
      // modification
      this.logDebug("Modification request from the backup helper", entry)
      return await this.handleRemoteBackupEntryChanged(entry);
    }, async (entry) => {
      // deletion
      this.logDebug("Deletion request from the backup helper", entry)
      // Nothing to do: we don't sync deleted wallets for now.
      return true;
    });

    // We are maybe adding a new wallet. We must make sure that a full successful sync is completed before
    // doing more backups, not not overwrite what could exist on the vault.
    this.fullySuccessfulSyncExpected = true;
  }

  /**
   * Main entry point to initiate a backup synchronization
   */
  public async checkSync(wallets: MasterWallet[]): Promise<boolean> {
    this.ensureRunningInUI();

    if (!this.userVault) {
      // No user vault available
      this.logDebug("No user vault available, skipping sync check for wallets backup");
      return false;
    }

    this.logDebug("Check sync is starting");

    try {
      // Stop all on going wallets synchronization first
      this.logDebug("Stopping on going subwallets sync");
      for (let wallet of wallets) {
        await WalletManager.instance.stopWalletSync(wallet.id);
      }

      // Start the remote sync process
      this.log("Starting backup helper sync()");
      let fullSyncCompleted = await this.backupRestoreHelper.sync(false);
      if (fullSyncCompleted) {
        this.logDebug("Backup helper sync() was fully completed.");

        this.fullySuccessfulSyncExpected = false;

        // Send updated data of local subwallets to the vault if it's a right time to do so.
        for (let wallet of wallets) {
          for (let subWallet of Object.values(wallet.subWallets)) {
            if (!this.supportedWalletForBackup(subWallet)) {
              continue;
            }

            this.logDebug("Checking if subwallet needs to be backup now", wallet, subWallet);
            this.checkBackupSubWallet(wallet, subWallet);
          }
        }
      }

      // Restart all wallets synchronizations
      this.logDebug("Restarting subwallets sync");
      for (let wallet of wallets) {
        await WalletManager.instance.startWalletSync(wallet.id);
      }
    }
    catch (e) {
      // Network error, etc
      console.error(e);
      return false;
    }

    return true;
  }

  private async checkBackupSubWallet(masterWallet: MasterWallet, subWallet: SubWallet) {
    let walletContextName = await this.getWalletSyncContextName(masterWallet);

    this.logDebug("checkBackupSubWallet()", masterWallet, subWallet)
    if (!this.supportedWalletForBackup(subWallet)) {
      return;
    }

    if (this.fullySuccessfulSyncExpected) {
      // We are requested to not allow doing more backups until a full sync is successful.
      this.logDebug("Fully successful sync is expected. Not doing a backup now.");
      return;
    }

    let existingLocalEntry = await this.backupRestoreHelper.getDatabaseEntry(walletContextName, subWallet.id);

    // Check if it's a good time to backup the wallet - mostly meaning that enough time has elapsed since last sync.
    if (!existingLocalEntry || await this.goodTimeToBackupWallet(masterWallet, subWallet)) {
      if (this.subWalletBackupInProgress) {
        return;
      }

      this.subWalletBackupInProgress = true;

      let entryData = {
        walletKey: await this.getWalletFirstELAAddress(masterWallet), // Constant reference to the parent master wallet
        lastSyncDate: subWallet.syncTimestamp // Timestamp in MS at which this subwallet was last modified
      };
      this.logDebug("It's a good time to backup:", masterWallet, subWallet);

      // Stop wallet sycn to make sure the SPV SDK doesn't keep writing while we read that .db file
      await WalletManager.instance.stopSubWalletSync(masterWallet.id, subWallet.id as StandardCoinName);

      // Upload the sync state file that is related to the given subwallet (ela.db, idchain.db...)
      let fileName = this.getSubwalletBackupFileName(subWallet)
      this.logDebug("Uploading file", fileName);
      if (await this.getAndUploadSPVSyncStateFile(masterWallet, fileName)) {
        this.logDebug("File successfully uploaded. Upserting database entry", entryData);
        await this.backupRestoreHelper.upsertDatabaseEntry(walletContextName, subWallet.id, entryData);
      }
      else {
        this.logError("Failed to upload file "+fileName+" to the vault");
      }

      await WalletManager.instance.startSubWalletSync(masterWallet.id, subWallet.id as StandardCoinName);

      this.subWalletBackupInProgress = false;
    }
    else {
      this.logDebug("Not a good time to backup:", masterWallet, subWallet);
    }
  }

  private getSubwalletBackupFileName(subWallet: SubWallet): string {
    switch (subWallet.id) {
      case StandardCoinName.ELA:
        return "ELA.db";
      case StandardCoinName.IDChain:
        return "IDChain.db";
      default:
        return null;
    }
  }

  public async onSyncProgress(masterWallet: MasterWallet, subWallet: StandardSubWallet) {
    this.ensureRunningInUI();
    await this.checkBackupSubWallet(masterWallet, subWallet);
  }

  private supportedWalletForBackup(subWallet: SubWallet): boolean {
    return subWallet.id == StandardCoinName.ELA || subWallet.id == StandardCoinName.IDChain;
  }

  private async getAndUploadSPVSyncStateFile(masterWallet: MasterWallet, backupFileName: string): Promise<boolean> {
    this.logDebug("Uploading vault file", backupFileName, masterWallet);

    try {
      // Reader to read the local spv state sync file on the device
      let reader = await walletManager.getBackupFile(masterWallet.id, backupFileName);

      // Writer to upload the spv sync state file to the vault
      let walletContextKey = await this.getWalletSyncContextName(masterWallet);
      let vaultFilePath = "sync/" + walletContextKey + "/" + backupFileName;
      let vaultWriter = await this.userVault.getFiles().upload(vaultFilePath);

      let readContent: Uint8Array = null;
      while (true) {
        readContent = await reader.read(20000);
        if (readContent && readContent.length > 0) {
          await vaultWriter.write(readContent);
          await vaultWriter.flush();
        }
        else
          break; // No more content to read, stop looping.
      }
      await reader.close();
      await vaultWriter.close();

      this.logDebug("File " + backupFileName + " successfully uploaded to the vault");
      return true;
    }
    catch (e) {
      this.logError("Exception while uploading sync state file to vault: " + e);
      return false;
    }
  }

  private async downloadAndSaveSPVSyncStateFile(masterWallet: MasterWallet, subWallet: SubWallet, backupFileName: string): Promise<boolean> {
    this.logDebug("Downloading vault file", backupFileName, masterWallet);

     try {
      let walletContextKey = await this.getWalletSyncContextName(masterWallet);
      let vaultFilePath = "sync/" + walletContextKey + "/" + backupFileName;
      let vaultReader = await this.userVault.getFiles().download(vaultFilePath);
      let writer = await walletManager.restoreBackupFile(masterWallet.id, backupFileName);

      // Before restoring the sync file, we must destroy the subwallet and we'll re-add it later.
      // This is for now the only way to let the SPVSDK reload the file.
      await masterWallet.destroySubWallet(subWallet.id);

      let readContent: Uint8Array = null;
      while (true) {
        readContent = await vaultReader.read(20000);
        if (readContent && readContent.length > 0) {
          await writer.write(readContent);
        }
        else
          break; // No more content to read, stop looping.
      }
      await vaultReader.close();
      await writer.close();

      await masterWallet.createSubWallet(this.coinService.getCoinByID(subWallet.id));

      this.logDebug("File downloaded and saved successfully");
      return true;
    }
    catch (e) {
      console.error(e);
      this.logError("Exception while downloading sync state file from vault: "+e);
      return false;
    }
  }

  private async findWalletByFirstELAAddress(elaAddress: string): Promise<MasterWallet> {
    for (let wallet of this.walletsList) {
      let elaSubWallet = wallet.getSubWallet(StandardCoinName.ELA) as MainchainSubWallet;
      let rootAddress = await elaSubWallet.getRootPaymentAddress();
      if (rootAddress == elaAddress)
        return wallet;
    }

    return null;
  }

  /**
   * A wallet that does not exist locally exists on the vault backup. We must restore it locally.
   */
  private async handleRemoteBackupEntryChanged(entry: BackupRestoreEntry): Promise<boolean> {
    this.logDebug("handleRemoteBackupEntryChanged()", entry);

    // Compare the remote lastsyncdate vs local
    let remoteLastSyncDate = entry.data.lastSyncDate; // Timestamp MS

    let wallet = await this.findWalletByFirstELAAddress(entry.data.walletKey);
    if (wallet) {
      // We've found the local wallet. Now look for the subwallet.
      let subWallet = wallet.getSubWallet(entry.key) as StandardSubWallet;
      if (subWallet) {
        let localLastSyncDate = subWallet.syncTimestamp;
        // If remote last sync date is more recent, download and restore files
        if (remoteLastSyncDate > localLastSyncDate) {
          this.logDebug("Remote sync date is more recent than local. We have to download the latest file version from the vault");
          if (await this.downloadAndSaveSPVSyncStateFile(wallet, subWallet, this.getSubwalletBackupFileName(subWallet))) {
            this.logDebug("Local sync file updated successfully with the more recent vault version");
            return true;
          }
          else {
            this.logWarn("Failed to download vault sync file");
            return false;
          }
        }
        else {
          // Local is more recent, don't restore.
          this.logDebug("Local sync date is more recent than remote", wallet, subWallet, remoteLastSyncDate, localLastSyncDate)
          return true;
        }
      }
      else {
        this.logDebug("Trying to handle a remote entry change but subwallet does not exist", wallet, entry.key);
        return false;
      }
    }
    else {
      // No wallet found for the given root address, which means user must first re-import his mnemonic.
      // At that time we can sync with remote data later.
      this.logDebug("No existing local wallet found for root address", entry.data.walletKey);
      return false;
    }
  }

  private async goodTimeToBackupWallet(wallet: MasterWallet, subWallet: SubWallet): Promise<boolean> {
    let walletContextName = await this.getWalletSyncContextName(wallet);
    let localBackupEntry = await this.backupRestoreHelper.getDatabaseEntry(walletContextName, subWallet.id);

    if (!localBackupEntry) {
      // Can't find a local backup entry, so this means we are called for a wallet that has no scheduled
      // backup yet. So, it's a good time to backup, because it's the very first time.
      return true;
    }

    // It's a good time to backup if the new subwallet sync date is more recent than X days/minutes from
    // the previous sync (because we don't want to backup too often to save network bandwidth).
    let stdSubWallet = subWallet as StandardSubWallet;
    let walletSyncDate = moment(stdSubWallet.syncTimestamp);
    let backupEntryDate = moment(localBackupEntry.data.lastSyncDate);
    this.logDebug("Good time to backup wallet?", walletSyncDate, backupEntryDate);
    if (walletSyncDate.isAfter(backupEntryDate.add(30, "days"))) {
      return true;
    }
    else {
      return false;
    }
  }

  /**
   * Master wallet is being destroyed locally. We delete its backup entry locally but not on the vault, so
   * that we will be able to sync from vault if the wallet is re-created (otherwise a full deletion would also)
   * delete sync state from the vault.
   */
  public async removeBackupTrackingForWallet(masterId: string) {
    if (!this.vaultIsConfigured()) {
      return;
    }

    this.logDebug("Removing all local backup entries for the wallet, without syncing this deletion to the vault.");

    let wallet = WalletManager.instance.getMasterWallet(masterId);
    let contextName = await this.getWalletSyncContextName(wallet);

    for (let subWallet of wallet.getSubWallets()) {
      await this.backupRestoreHelper.deleteDatabaseEntry(contextName, subWallet.id, true);
    }
  }

  private log(message: any, ...params: any) {
    console.log("BackupRestoreService: ", message, ...params);
  }

  private logDebug(message: any, ...params: any) {
    if (BackupRestoreService.SHOW_DEBUG_LOGS)
      console.log("BackupRestoreService: ", message, ...params);
  }

  private logWarn(message: any, ...params: any) {
    console.warn("BackupRestoreService: ", message, ...params);
  }

  private logError(message: any, ...params: any) {
    console.error("BackupRestoreService: ", message, ...params);
  }
}
