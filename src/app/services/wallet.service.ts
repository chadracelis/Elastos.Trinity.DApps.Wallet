/*
 * Copyright (c) 2019 Elastos Foundation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Events, ModalController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import moment from 'moment';

import { SPVWalletPluginBridge, SPVWalletMessage, TxPublishedResult, ETHSCEventType, ETHSCEvent, ETHSCEventAction } from '../model/SPVWalletPluginBridge';
import { MasterWallet, WalletID } from '../model/wallets/MasterWallet';
import { StandardCoinName, CoinType } from '../model/Coin';
import { WalletAccountType, WalletAccount } from '../model/WalletAccount';
import { AppService } from './app.service';
import { SubWallet, SerializedSubWallet } from '../model/wallets/SubWallet';
import { InvalidVoteCandidatesHelper, InvalidCandidateForVote } from '../model/InvalidVoteCandidatesHelper';
import { CoinService } from './coin.service';
import { JsonRPCService } from './jsonrpc.service';
import { PopupProvider } from './popup.service';
import { Native } from './native.service';
import { InAppRPCMessage, RPCMethod, RPCStartWalletSyncParams, RPCStopWalletSyncParams, SPVSyncService } from './spvsync.service';
import { LocalStorage } from './storage.service';
import { AuthService } from './auth.service';
import { Transfer } from './cointransfer.service';
import { PrefsService } from './prefs.service';
import { IDChainSubWallet } from '../model/wallets/IDChainSubWallet';
import { MainchainSubWallet } from '../model/wallets/MainchainSubWallet';
import { BackupRestoreService } from './backuprestore.service';
import { StandardSubWallet } from '../model/wallets/StandardSubWallet';
import { MainAndIDChainSubWallet } from '../model/wallets/MainAndIDChainSubWallet';

declare let appManager: AppManagerPlugin.AppManager;

class TransactionMapEntry {
    Code: number = null;
    Reason: string = null;
    WalletID: string = null;
    ChainID: string = null;
    Status: string = null;
    lock: boolean = false;
}

type TransactionMap = {
    [k: string]: TransactionMapEntry;
};

// TODO: Replace all the Promise<any> with real data structures
// TODO: Use real types everywhere, no "any" any more.

/***
 * wallet jni 交互
 *
 * WalletManager.ts -> Wallet.js -> wallet.java -> WalletManager.java
 */
@Injectable({
    providedIn: 'root'
})
export class WalletManager {
    public static instance: WalletManager = null;

    public masterWallets: {
        [index: string]: MasterWallet
    } = {};

    // TODO: what is this map for? Can we rename it ?
    public transactionMap: TransactionMap = {}; // when sync over, need to cleanup transactionMap

    public hasPromptTransfer2IDChain = true;

    public needToCheckUTXOCountForConsolidation = true;
    public needToPromptTransferToIDChain = false; // Whether it's time to ask user to transfer some funds to the ID chain for better user experience or not.

    public spvBridge: SPVWalletPluginBridge = null;

    constructor(
        public events: Events,
        public native: Native,
        public zone: NgZone,
        public modalCtrl: ModalController,
        public translate: TranslateService,
        public localStorage: LocalStorage,
        private appService: AppService,
        private syncService: SPVSyncService,
        private coinService: CoinService,
        private authService: AuthService,
        public popupProvider: PopupProvider,
        private http: HttpClient,
        public jsonRPCService: JsonRPCService,
        private prefs: PrefsService,
        private backupService: BackupRestoreService
    ) {
        WalletManager.instance = this;
    }

    async init() {
        console.log("Master manager is initializing");

        this.spvBridge = new SPVWalletPluginBridge(this.native, this.events, this.popupProvider);

        let hasWallet = await this.initWallets();

        if (!this.appService.runningAsAService()) {
            this.jsonRPCService.init();

            if (!hasWallet) {
                this.goToLauncherScreen();
                return;
            }

            this.registerSubWalletListener();

            appManager.setListener((message) => {
                this.handleAppManagerMessage(message);
                this.appService.onMessageReceived(message);
            });

            await this.startSyncAllWallet();

            this.localStorage.get('hasPrompt').then((val) => {
                this.hasPromptTransfer2IDChain = val ? val : false;
            });

            let publishTxList = await this.localStorage.getPublishTxList();
            if (publishTxList) {
                this.transactionMap = publishTxList;
            }

            // TODO: spvsdk can't get progress by api
            // Get last block time, progress from walletservice
            const rpcMessage: InAppRPCMessage = {
                method: RPCMethod.GET_WALLET_SYNC_PROGRESS,
                params: '',
                startupMode: this.appService.getStartupMode()
            };
            appManager.sendMessage("#service:walletservice",
                                    AppManagerPlugin.MessageType.INTERNAL,
                                    JSON.stringify(rpcMessage), () => {
                // Nothing to do
            }, (err) => {
                console.log("Failed to send start RPC message to the sync service", err);
                // If the sync service does not start, then get balance by rpc.
                this.getAllMasterWalletBalanceByRPC();
            });
        } else {
            // Start the sync service if we are in a background service
            await this.syncService.init(this);
        }

        console.log("Wallet manager initialization complete");

        this.events.publish("walletmanager:initialized");

        // The base init is completed. Now let's start the backup service in background (not a blocking await)
        this.initBackupService();
    }

    private async initWallets(): Promise<boolean> {
        try {
            console.log("Getting all master wallets from the SPV SDK");
            const idList = await this.spvBridge.getAllMasterWallets();

            if (idList.length === 0) {
                console.log("No SPV wallet found, going to launcher screen");
                this.goToLauncherScreen();
                return false;
            }

            console.log("Got "+idList.length+" wallets from the SPVSDK");

            // Rebuild our local model for all wallets returned by the SPV SDK.
            for (var i = 0; i < idList.length; i++) {
                let masterId = idList[i];

                console.log("Rebuilding local model for subwallet id "+masterId);

                // Try to retrieve locally storage extended info about this wallet
                let extendedInfo = await this.localStorage.getExtendedMasterWalletInfos(masterId);
                if (!extendedInfo) {
                    // No backward compatibility support: old wallets are just destroyed.
                    await this.spvBridge.destroyWallet(masterId);
                    continue;
                } else {
                    console.log("Found extended wallet info for master wallet id " + masterId, extendedInfo);

                    // Create a model instance for each master wallet returned by the SPV SDK.
                    this.masterWallets[masterId] = new MasterWallet(this, this.coinService, masterId);

                    if (extendedInfo.subWallets.length < 3) {
                        // open IDChain and ETHSC automatically
                        let subwallet: SerializedSubWallet = extendedInfo.subWallets.find(wallet => wallet.id === StandardCoinName.IDChain);
                        if (!subwallet) {
                            console.log('Opening IDChain');
                            const subWallet = new IDChainSubWallet(this.masterWallets[masterId]);
                            extendedInfo.subWallets.push(subWallet.toSerializedSubWallet());
                        }
                        subwallet = extendedInfo.subWallets.find(wallet => wallet.id === StandardCoinName.ETHSC);
                        if (!subwallet) {
                            console.log('Opening ETHSC');
                            const subWallet = new MainchainSubWallet(this.masterWallets[masterId]);
                            extendedInfo.subWallets.push(subWallet.toSerializedSubWallet());
                        }
                    }
                }

                await this.masterWallets[masterId].populateWithExtendedInfo(extendedInfo);
            }
        }
        catch (error) {
            console.error(error);
            return false;
        }
        return true;
    }

    // Backup service runs only in the UI because it requires user interaction sometimes, and we don't
    // wan't data model overlaps/conflicts with the background service or with intents.
    private async initBackupService() {
        if (!this.appService.runningAsMainUI())
            return;

        // Give some fresh air to the wallet while starting, to show the UI first without overloading the CPU.
        // There is no hurry to start the backup service.
        setTimeout(async ()=>{
            await this.backupService.init();

            for (let wallet of this.getWalletsList()) {
                await this.backupService.setupBackupForWallet(wallet);
            }

            await this.backupService.checkSync(Object.values(this.masterWallets));
        }, 5000);
    }

    // TODO: delete it, we do not use active wallet
    public setRecentWalletId(id) {
        this.localStorage.saveCurMasterId({ masterId: id });
    }

    public getMasterWallet(masterId: WalletID): MasterWallet {
        return this.masterWallets[masterId];
    }

    public getWalletsList(): MasterWallet[] {
        return Object.values(this.masterWallets);
    }

    public getWalletsCount(): number {
        return Object.values(this.masterWallets).length;
    }

    public walletNameExists(name: string): boolean {
        let existingWallet = Object.values(this.masterWallets).find((wallet) => {
            return wallet.name === name;
        });
        return existingWallet != null;
    }

    private goToLauncherScreen() {
        this.native.setRootRouter('/launcher');
    }

    public async getCurrentMasterIdFromStorage(): Promise<string> {
        let data = await this.localStorage.getCurMasterId();

        if (data && data["masterId"]) {
            return data["masterId"];
        } else {
            return null;
        }
    }

    /**
     * Creates a new master wallet both in the SPV SDK and in our local model.
     */
    public async createNewMasterWallet(
        masterId: WalletID,
        walletName: string,
        mnemonicStr: string,
        mnemonicPassword: string,
        payPassword: string,
        singleAddress: boolean
    ) {
        console.log("Creating new master wallet");

        await this.spvBridge.createMasterWallet(
            masterId,
            mnemonicStr,
            mnemonicPassword,
            payPassword,
            singleAddress
        );

        let account: WalletAccount = {
            SingleAddress: singleAddress,
            Type: WalletAccountType.STANDARD
        };

        await this.addMasterWalletToLocalModel(masterId, walletName, account);
    }

    /**
     * Creates a new master wallet both in the SPV SDK and in our local model, using a given mnemonic.
     */
    public async importMasterWalletWithMnemonic(
        masterId: WalletID,
        walletName: string,
        mnemonicStr: string,
        mnemonicPassword: string,
        payPassword: string,
        singleAddress: boolean
    ) {
        console.log("Importing new master wallet with mnemonic");

        await this.spvBridge.importWalletWithMnemonic(masterId, mnemonicStr, mnemonicPassword, payPassword, singleAddress);

        let account: WalletAccount = {
            SingleAddress: singleAddress,
            Type: WalletAccountType.STANDARD
        };

        await this.addMasterWalletToLocalModel(masterId, walletName, account);
    }

    private async addMasterWalletToLocalModel(id: WalletID, name: string, walletAccount: WalletAccount) {
        console.log("Adding master wallet to local model", id, name);

        // Add a new wallet to our local model
        this.masterWallets[id] = new MasterWallet(this, this.coinService, id, name);

        // Set some wallet account info
        this.masterWallets[id].account = walletAccount;

        // Get some basic information ready in our model.
        await this.masterWallets[id].populateWithExtendedInfo(null);

        // A master wallet must always have at least the ELA subwallet
        await this.masterWallets[id].createSubWallet(this.coinService.getCoinByID(StandardCoinName.ELA));

        // Even if not mandatory to have, we open the main sub wallets for convenience as well.
        await this.masterWallets[id].createSubWallet(this.coinService.getCoinByID(StandardCoinName.IDChain));
        await this.masterWallets[id].createSubWallet(this.coinService.getCoinByID(StandardCoinName.ETHSC));

        this.registerSubWalletListener();

        // Save state to local storage
        await this.saveMasterWallet(this.masterWallets[id]);

        this.setRecentWalletId(id);

        // Add this new wallet to the backup service
        await this.backupService.setupBackupForWallet(this.getMasterWallet(id));

        // Sync with remote
        await this.backupService.checkSync(this.getWalletsList());

        this.startWalletSync(id);

        // Go to wallet's home page.
        this.native.setRootRouter("/wallet-home");

        // Get balance by rpc
        this.getAllSubwalletsBalanceByRPC(id);
    }

    /**
     * Destroy a master wallet, active or not, base on its id
     */
    async destroyMasterWallet(id: string) {
        // Stop dealing with this wallet in the backup service
        await this.backupService.removeBackupTrackingForWallet(id);

        // Destroy the wallet in the wallet plugin
        await this.spvBridge.destroyWallet(id);

        // Remove password
        await this.authService.deleteWalletPassword(id);

        // Save this modification to our permanent local storage
        await this.localStorage.setExtendedMasterWalletInfo(this.masterWallets[id].id, null);

        // Destroy from our local model
        delete this.masterWallets[id];

        // Notify some listeners
        this.events.publish("masterwallet:destroyed", id);

        if (Object.values(this.masterWallets).length > 0) {

        /** Causes bug with deleting wallets that are not active, works ok without this code but kept for reference **/
         /*    // Get active wallet
            const recentWalletId = await this.getCurrentMasterIdFromStorage();
            // If active wallet was deleted wallet, set new active wallet to first wallet in master wallet list
            if (recentWalletId && recentWalletId === id) {
                this.setRecentWalletId(this.masterWallets[0].id);
            }
        */

            this.native.setRootRouter("/wallet-home");
        } else {
            this.goToLauncherScreen();
        }
    }

    /**
     * Save master wallets list to permanent local storage.
     */
    public async saveMasterWallet(masterWallet: MasterWallet) {
        if (this.appService.runningAsAService()) {
            console.log("NOT saving the master wallet from the background service to avoid conflicts with the UI model that would save at the same time");
            return;
        }

        const extendedInfo = masterWallet.getExtendedWalletInfo();
        console.log("Saving wallet extended info", masterWallet.id, extendedInfo);

        await this.localStorage.setExtendedMasterWalletInfo(masterWallet.id, extendedInfo);
    }

    public async startSyncAllWallet() {
        for (const masterWallet of Object.values(this.masterWallets)) {
            this.startWalletSync(masterWallet.id);
        }
    }

    /**
     * Inform the background service (via RPC) that we want to start syncing a wallet.
     * If there is another wallet syncing, its on going sync will be stopped first.
     */
    public async startWalletSync(masterId: WalletID): Promise<void> {
        console.log("Requesting sync service to start syncing wallet " + masterId);

        if (!this.getMasterWallet(masterId)) {
            // The master wallet is destroyed.
            console.log('startWalletSync error, the master wallet does not exist!');
            return;
        }

        // Add only standard subwallets to SPV sync request
        let chainIds: StandardCoinName[] = [];
        for (let subWallet of Object.values(this.getMasterWallet(masterId).subWallets)) {
            if (subWallet.type == CoinType.STANDARD)
                chainIds.push(subWallet.id as StandardCoinName);
        }

        await this.startSubWalletsSync(masterId, chainIds);
    }

    // TODO: When wallet is destroyed
    public async stopWalletSync(masterId: WalletID): Promise<void> {
        console.log("Requesting sync service to stop syncing wallet " + masterId);

        // Add only standard subwallets to SPV stop sync request
        let chainIds: StandardCoinName[] = [];
        for (let subWallet of Object.values(this.getMasterWallet(masterId).subWallets)) {
            if (subWallet.type == CoinType.STANDARD)
                chainIds.push(subWallet.id as StandardCoinName);
        }

        await this.stopSubWalletsSync(masterId, chainIds);
    }

    private startSubWalletsSync(masterId: WalletID, subWalletIds: StandardCoinName[]): Promise<void> {
        return new Promise(async (resolve, reject) => {
            console.log("Requesting sync service to start syncing some subwallets for wallet " + masterId);
            let messageParams: RPCStartWalletSyncParams = {
                masterId: masterId,
                chainIds: subWalletIds
            };

            let rpcMessage: InAppRPCMessage = {
                method: RPCMethod.START_WALLET_SYNC,
                params: messageParams,
                startupMode: this.appService.getStartupMode()
            };

            if (this.appService.runningAsAService()) {
                await this.syncService.syncStartSubWallets(messageParams.masterId, messageParams.chainIds);
                resolve();
            } else {
                appManager.sendMessage("#service:walletservice", AppManagerPlugin.MessageType.INTERNAL, JSON.stringify(rpcMessage), () => {
                    resolve();
                }, (err) => {
                    // Service probably not running
                    console.log("Failed to send start RPC message to the sync service", err);
                    resolve();
                });
            }
        });
    }

    private stopSubWalletsSync(masterId: WalletID, subWalletIds: StandardCoinName[]): Promise<void> {
        return new Promise(async (resolve, reject)=>{
            console.log("Requesting sync service to stop syncing some subwallets for wallet " + masterId);

            let messageParams: RPCStopWalletSyncParams = {
                masterId: masterId,
                chainIds: subWalletIds
            };

            let rpcMessage: InAppRPCMessage = {
                method: RPCMethod.STOP_WALLET_SYNC,
                params: messageParams,
                startupMode: this.appService.getStartupMode()
            };

            if (this.appService.runningAsAService()) {
                await this.syncService.syncStopSubWallets(messageParams.masterId, messageParams.chainIds);
                resolve();
            } else {
                appManager.sendMessage("#service:walletservice", AppManagerPlugin.MessageType.INTERNAL, JSON.stringify(rpcMessage), () => {
                    resolve();
                }, (err) => {
                    // Service probably not running
                    console.warn("Failed to send stop RPC message to the sync service:", err);
                    resolve();
                });
            }
        });
    }

    public async startSubWalletSync(masterId: WalletID, subWalletId: StandardCoinName): Promise<void> {
        await this.startSubWalletsSync(masterId, [subWalletId]);
    }

    public async stopSubWalletSync(masterId: WalletID, subWalletId: StandardCoinName): Promise<void> {
        await this.stopSubWalletsSync(masterId, [subWalletId]);
    }

    /**
     * Start listening to all events from the SPV SDK.
     */
    public registerSubWalletListener() {
        // For now, don't listen to wallet events while in the service.
        if (this.appService.runningAsAService())
            return;

        console.log("Register wallet listener");

        this.spvBridge.registerWalletListener((event: SPVWalletMessage) => {
            this.zone.run(() => {
                this.handleSubWalletEvent(event);
            });
        });
    }

    /**
     * Handler for AppManager Message.
     */
    private handleAppManagerMessage(message: AppManagerPlugin.ReceivedMessage) {
        if (!message || !message.message)
            return;

        console.log('handleAppManagerMessage: ', message);
        const rpcMessage = JSON.parse(message.message) as InAppRPCMessage;
        switch (rpcMessage.method) {
            case RPCMethod.SEND_WALLET_SYNC_PROGRESS:
                // tslint:disable-next-line:forin
                for (const masterId in rpcMessage.params) {
                    // tslint:disable-next-line:forin
                    for (const chainIdKey in rpcMessage.params[masterId]) {
                        const chainId = chainIdKey as StandardCoinName;
                        const progress = rpcMessage.params[masterId][chainId].progress || 0;
                        const lastBlockTime = rpcMessage.params[masterId][chainId].lastBlockTime || 0;
                        this.updateSyncProgress(masterId, chainId, progress, lastBlockTime);
                    }
                }

                this.getAllMasterWalletBalanceByRPC();
                break;
            default:
                break;
        }
    }

    /**
     * Handler for all SPV wallet events.
     */
    public handleSubWalletEvent(event: SPVWalletMessage) {
        let masterId = event.MasterWalletID;
        let chainId = event.ChainID;

        console.log("SubWallet message: ", masterId, chainId, event);
        //console.log(event.Action, event.result);

        switch (event.Action) {
            case "OnTransactionStatusChanged":
                if (this.transactionMap[event.txId]) {
                    this.transactionMap[event.txId].Status = event.status;
                }
                break;
            case "OnBlockSyncProgress":
                this.updateSyncProgressFromCallback(masterId, chainId, event);
                break;
            case "OnBalanceChanged":
                this.getMasterWallet(masterId).getSubWallet(chainId).updateBalance();
                break;
            case "OnTxPublished":
                this.handleTransactionPublishedEvent(event);
                break;

            case "OnBlockSyncStopped":
            case "OnAssetRegistered":
            case "OnBlockSyncStarted":
            case "OnConnectStatusChanged":
                // Nothing
                break;
            case "OnETHSCEventHandled":
                this.updateETHSCEventFromCallback(masterId, chainId, event);
                break;
        }
    }

    /**
     * Updates the progress value of current wallet synchronization. This progress change
     * is saved into the model and triggers events so that the UI can update itself.
     */
    private updateSyncProgressFromCallback(masterId: WalletID, chainId: StandardCoinName, result: SPVWalletMessage) {
        this.updateSyncProgress(masterId, chainId, result.Progress, result.LastBlockTime);
    }

    private async updateSyncProgress(masterId: WalletID, chainId: StandardCoinName, progress: number, lastBlockTime: number) {
        let masterWallet = this.getMasterWallet(masterId);
        if (!masterWallet) {
            console.warn("updateSyncProgress() called but wallet with ID", masterId, "does not exist!");
            return;
        }

        masterWallet.updateSyncProgress(chainId, progress, lastBlockTime);

        let subWallet = masterWallet.getSubWallet(chainId) as StandardSubWallet;
        // console.log("DEBUG updateSyncProgress", masterId, chainId, masterWallet.getSubWallets())
        // Seems like we can sometimes receive an update progress about a subwallet not yet added. Reason unknown for now.
        if (!subWallet) {
            console.warn("updateSyncProgress() called but subwallet with ID", chainId, "does not exist in wallet!", masterWallet);
            return;
        }

        await this.backupService.onSyncProgress(masterWallet, subWallet);

        if (!this.hasPromptTransfer2IDChain && (chainId === StandardCoinName.IDChain)) {
            let elaProgress = this.masterWallets[masterId].subWallets[StandardCoinName.ELA].progress;
            let idChainProgress = this.masterWallets[masterId].subWallets[StandardCoinName.IDChain].progress;

            // Check if it's a right time to prompt user for ID chain transfers, but only if we are fully synced.
            if (elaProgress == 100 && idChainProgress == 100) {
                this.checkIDChainBalance(masterId);
            }
        }
    }

    // ETHSC has different event
    private updateETHSCEventFromCallback(masterId: WalletID, chainId: StandardCoinName, result: SPVWalletMessage) {
        // console.log('----updateETHSCEventFromCallback chainId:', chainId, ' result:', result);
        switch (result.event.Type) {
            case ETHSCEventType.EWMEvent: // update progress
                switch (result.event.Event) {
                    case ETHSCEventAction.PROGRESS:
                        // console.log('----updateETHSCEventFromCallback masterId:', masterId, ' result.event:', result.event);
                        result.Progress =  Math.round(result.event.PercentComplete);
                        result.LastBlockTime = result.event.Timestamp;
                        break;
                    case ETHSCEventAction.CHANGED:
                        if (('CONNECTED' === result.event.NewState) && ('CONNECTED' === result.event.OldState)) {
                            result.Progress =  100;
                            result.LastBlockTime = new Date().getTime() / 1000;
                            // console.log('----updateETHSCEventFromCallback set 100 masterId:', masterId, ' result.event:', result.event);
                        } else if ('DISCONNECTED' === result.event.NewState) {
                            result.Progress =  0;
                        } else {
                            // TODO
                            result.Progress =  0;
                        }
                        break;
                    default:
                        // Do nothing
                        break;
                }
                this.updateSyncProgress(masterId, chainId, result.Progress, result.LastBlockTime);
                const erc20SubWallets = this.getMasterWallet(masterId).getSubWalletsByType(CoinType.ERC20);
                for (const subWallet of erc20SubWallets) {
                    subWallet.updateSyncProgress(result.Progress, result.LastBlockTime);
                }
                break;
            case ETHSCEventType.WalletEvent: // update balance
                if (result.event.Event === ETHSCEventAction.BALANCE_UPDATED) {
                    // console.log('----updateETHSCEventFromCallback BALANCE_UPDATED:', result, ' masterId:', masterId, ' chainId:', chainId);
                    this.getMasterWallet(masterId).getSubWallet(chainId).updateBalance();
                }
                break;
            case ETHSCEventType.TransferEvent:
                // console.log('----updateETHSCEventFromCallback TransferEvent:', result, ' masterId:', masterId, ' chainId:', chainId);
                // ERC20 Token transfer
                // TODO: update the balance
                break;
            case ETHSCEventType.TokenEvent:
                // console.log('----updateETHSCEventFromCallback TokenEvent:', result, ' masterId:', masterId, ' chainId:', chainId);
                // TODO
                break;
            default:
                // TODO: check other event
                break;
        }
    }

    private handleTransactionPublishedEvent(data: SPVWalletMessage) {
        let MasterWalletID = data.MasterWalletID;
        let chainId = data.ChainID;
        let hash = data.hash;

        let result = JSON.parse(data["result"]) as TxPublishedResult;
        let code = result.Code;
        let reason = result.Reason;

        let tx = "txPublished-";

        // TODO: messy again - what is the transaction map type? Mix of TxPublishedResult and SPVWalletMessage ?
        if (this.transactionMap[hash]) {
            this.transactionMap[hash].Code = code;
            this.transactionMap[hash].Reason = reason;
            this.transactionMap[hash].WalletID = MasterWalletID;
            this.transactionMap[hash].ChainID = chainId;
        } else {
            this.transactionMap[hash] = new TransactionMapEntry();
            this.transactionMap[hash].WalletID = MasterWalletID;
            this.transactionMap[hash].ChainID = chainId;
            this.transactionMap[hash].Code = code;
            this.transactionMap[hash].Reason = reason;

            this.localStorage.savePublishTxList(this.transactionMap);
        }

        if (code !== 0) {
            console.log('OnTxPublished fail:', JSON.stringify(data));
            this.popupProvider.ionicAlert_PublishedTx_fail('transaction-fail', tx + code, hash, reason);
            if (this.transactionMap[hash].lock !== true) {
                delete this.transactionMap[hash];
                this.localStorage.savePublishTxList(this.transactionMap);
            }
        }
    }

    public setHasPromptTransfer2IDChain() {
        this.hasPromptTransfer2IDChain = true;
        this.needToPromptTransferToIDChain = false;
        this.localStorage.set('hasPrompt', true); // TODO: rename to something better than "hasPrompt"
    }

    // TODO: make a more generic flow to not do this only for the ID chain but also for the ETH chain.
    public checkIDChainBalance(masterId: WalletID) {
        if (this.hasPromptTransfer2IDChain) { return; }
        if (this.needToPromptTransferToIDChain) { return; }

        // // IDChain not open, do not prompt
        // if (Util.isNull(this.masterWallet[this.curMasterId].subWallets[Config.IDCHAIN])) {
        //     return;
        // }

        const masterWallet = this.getMasterWallet(masterId);
        if (masterWallet.subWallets[StandardCoinName.ELA].balance.lte(1000000)) {
            console.log('ELA balance ', masterWallet.subWallets[StandardCoinName.ELA].balance);
            return;
        }

        if (masterWallet.subWallets[StandardCoinName.IDChain].balance.gt(100000)) {
            console.log('IDChain balance ',  masterWallet.subWallets[StandardCoinName.IDChain].balance);
            return;
        }

        this.needToPromptTransferToIDChain = true;
    }

    // for intent
    // TODO: What's this? lock what for what?
    lockTx(hash) {
        if (this.transactionMap[hash]) {
            this.transactionMap[hash].lock = true;
        } else {
            this.transactionMap[hash] = new TransactionMapEntry();
            this.transactionMap[hash].lock = true;

            this.localStorage.savePublishTxList(this.transactionMap);
        }
    }

    public getTxCode(hash) {
        let code = 0;
        if (this.transactionMap[hash].Code) {
            code = this.transactionMap[hash].Code;
        }

        if (this.transactionMap[hash].Status === 'Deleted') { // success also need delete
            delete this.transactionMap[hash];
            this.localStorage.savePublishTxList(this.transactionMap);
        } else {
            this.transactionMap[hash].lock = false;
        }

        return code;
    }

    cleanTransactionMap() {
        this.transactionMap = {};
        this.localStorage.savePublishTxList(this.transactionMap);
    }

    /**
     * Retrieves the wallet store password from the password manager.
     * This method is here since the beginning and seems useless. Could probably be replaced by
     * authService's getWalletPassword() directly.
     */
    public async openPayModal(transfer: Transfer): Promise<string> {
        const payPassword = await this.authService.getWalletPassword(transfer.masterWalletId, true, true);
        if (payPassword === null) {
            return null;
        }
        transfer.payPassword = payPassword;

        return payPassword;
    }

    /**
     * Voting requires to provide a list of invalid candidates.
     *
     * Here is an example:
     *
     * The vote information in the last vote transaction is
     * 1) vote 3 dpos nodes[D1,D2,D3, 3 ELA for each]
     * 2) vote proposal[P1, 10 ELA for it]
     * 3) impeach CR member[CR-1, 8 ELA for him]
     * 4) vote for CR Candidate [C1:2ELA, C2:5ELA]
     *
     * Now we want to vote to against a proposal P2, and deal with the data above, the result will be:
     *
     * 1) check if D1~D3 are valid now. If D3 is unregistered, D3 is illegal and need to pass into invalidCandidates
     * 2) check if Proposal P1 is still in Notification. If not, put it into invalidCandidates too. Otherwise, you need to record this data and add it to the new vote payload
     * 3) check if CR member CR-1 has been impeached and he is not a CR member now. If he is not a CR member now, we should put CR-1 into invalidCandidates.
     * 4) check whether it is in the election period. If it's not in the election period, we need to put C1 and C2 in invalidCandidates.
     */
    public async computeVoteInvalidCandidates(masterWalletId: string): Promise<InvalidCandidateForVote[]> {
        let helper = new InvalidVoteCandidatesHelper(this.http, this, masterWalletId, this.prefs);
        return await helper.computeInvalidCandidates();
    }

    async getAllMasterWalletBalanceByRPC() {
        for (const masterWallet of Object.values(this.masterWallets)) {
            await this.getAllSubwalletsBalanceByRPC(masterWallet.id);
        }
    }

    async getAllSubwalletsBalanceByRPC(masterWalletId) {
        const currentTimestamp = moment().valueOf();
        const onedayago = moment().add(-1, 'days').valueOf();
        const masterWallet = this.getMasterWallet(masterWalletId);

        let subwallets = masterWallet.subWalletsWithExcludedCoin(StandardCoinName.ETHSC, CoinType.STANDARD);
        for (let subWallet of subwallets) {
            // Get balance by RPC if the last block time is one day ago.
            if (!subWallet.lastBlockTime || (moment(subWallet.lastBlockTime).valueOf() < onedayago)) {
                try {
                    const balance = await (subWallet as MainAndIDChainSubWallet).getBalanceByRPC(this.jsonRPCService);

                    subWallet.balanceByRPC = balance;
                    subWallet.balance = balance;
                    subWallet.timestampRPC = currentTimestamp;
                } catch (e) {
                    console.log('getBalanceByRPC exception:', e);
                }
            }
        }
    }

    sendIntentResponse(action, result, intentId): Promise<void> {
        return new Promise((resolve, reject)=>{
            appManager.sendIntentResponse(action, result, intentId, () => {
                resolve();
            }, (err) => {
                console.error('sendIntentResponse error!', err);
                reject(err);
            });
        });
    }
}
