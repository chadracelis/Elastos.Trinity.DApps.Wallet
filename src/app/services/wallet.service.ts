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
import { Events, ModalController, Platform } from '@ionic/angular';
import { Config } from '../config/Config';
import { Native } from './native.service';
import { PopupProvider } from './popup.service';
import { Util } from '../model/Util';
import { TranslateService } from '@ngx-translate/core';
import { LocalStorage } from './storage.service';
import { SignedTransaction, SPVWalletPluginBridge, SPVWalletMessage, TxPublishedResult } from '../model/SPVWalletPluginBridge';
import { PaymentboxComponent } from '../components/paymentbox/paymentbox.component';
import { MasterWallet, WalletID } from '../model/MasterWallet';
import { StandardCoinName, CoinType } from '../model/Coin';
import { CoinService } from './coin.service';
import { WalletAccountType, WalletAccount } from '../model/WalletAccount';
import { InAppRPCMessage, RPCMethod, RPCStartWalletSyncParams, RPCStopWalletSyncParams, SPVSyncService } from './spvsync.service';
import { AppService } from './app.service';
import { SubWallet, SerializedSubWallet } from '../model/SubWallet';
import { StandardSubWallet } from '../model/StandardSubWallet';

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
}

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
    public activeMasterWallet: MasterWallet = null;

    public masterWallets: {
        [index: string]: MasterWallet
    } = {};

    // TODO: what is this map for? Can we rename it ?
    public transactionMap: TransactionMap = {}; // when sync over, need to cleanup transactionMap

    public hasPromptTransfer2IDChain = true;

    public needToCheckUTXOCountForConsolidation = true;
    public needToPromptTransferToIDChain = false; // Whether it's time to ask user to transfer some funds to the ID chain for better user experience or not.

    public spvBridge: SPVWalletPluginBridge = null;

    constructor(public events: Events,
                public native: Native,
                public zone: NgZone,
                public modalCtrl: ModalController,
                public translate: TranslateService,
                public localStorage: LocalStorage,
                private platform: Platform,
                private appService: AppService,
                private syncService: SPVSyncService,
                private coinService: CoinService,
                public popupProvider: PopupProvider) {
    }

    async init() {
        console.log("Master manager is initializing");

        this.spvBridge = new SPVWalletPluginBridge(this.native, this.events, this.popupProvider);

        try {
            let idList = await this.spvBridge.getAllMasterWallets();

            if (idList.length === 0) {
                this.goToLauncherScreen();
                return;
            }

            // Rebuild our local model for all wallets returned by the SVP SDK.
            for (var i = 0; i < idList.length; i++) {
                let masterId = idList[i];

                // Create a model instance for each master wallet returned by the SPV SDK.
                this.masterWallets[masterId] = new MasterWallet(this, this.coinService, masterId);

                // TODO call verifyPassPhrase when active wallet: for ethereum
                // await this.spvBridge.verifyPassPhrase(masterId, '', '12345678');
                // await this.spvBridge.verifyPayPassword(masterId, '12345678');

                // Try to retrieve locally storage extended info about this wallet
                let extendedInfo = await this.localStorage.getExtendedMasterWalletInfos(masterId);
                if (!extendedInfo) {
                    console.warn("No local storage info found for this wallet. This may happen when upgrading this app from a older app version.");
                    console.warn("Now creating default values for backward compatibility");

                    this.masterWallets[masterId].name = "No name";

                    // Re-add the default sub-wallets
                    await this.masterWallets[masterId].createSubWallet(this.coinService.getCoinByID(StandardCoinName.ELA));
                    await this.masterWallets[masterId].createSubWallet(this.coinService.getCoinByID(StandardCoinName.IDChain));
                    await this.masterWallets[masterId].createSubWallet(this.coinService.getCoinByID(StandardCoinName.ETHSC));

                    await this.saveMasterWallet(this.masterWallets[masterId]);

                    extendedInfo = this.masterWallets[masterId].getExtendedWalletInfo();

                    console.log("Using rebuilt extended info", extendedInfo);
                }
                else {
                    console.log("Found extended wallet info for master wallet id "+masterId, extendedInfo);
                    if (extendedInfo.subWallets.length < 3) {
                      // open IDChain and ETHSC automatic
                      let subwallet: SerializedSubWallet = extendedInfo.subWallets.find(wallet => wallet.id === StandardCoinName.IDChain);
                      if (!subwallet) {
                        console.log('Open IDChain');
                        const subWallet = new StandardSubWallet(this.masterWallets[masterId], StandardCoinName.IDChain);
                        extendedInfo.subWallets.push(subWallet.toSerializedSubWallet());
                      }
                      subwallet = extendedInfo.subWallets.find(wallet => wallet.id === StandardCoinName.ETHSC);
                      if (!subwallet) {
                        console.log('Open ETHSC');
                        const subWallet = new StandardSubWallet(this.masterWallets[masterId], StandardCoinName.ETHSC);
                        extendedInfo.subWallets.push(subWallet.toSerializedSubWallet());
                      }
                    }
                }

                await this.masterWallets[masterId].populateWithExtendedInfo(extendedInfo);

                this.registerSubWalletListener();
            }
        }
        catch (error) {
            console.error(error);
        }

        this.localStorage.get('hasPrompt').then( (val) => {
            this.hasPromptTransfer2IDChain = val ? val : false;
        });

        let publishTxList = await this.localStorage.getPublishTxList();
        if (publishTxList) {
            this.transactionMap = publishTxList;
        }

        console.log("Wallet manager initialization complete");

        // Set Active Master Wallet
        if (Object.values(this.masterWallets).length > 0) {
          let storedMasterId = await this.getCurrentMasterIdFromStorage();

          // Wrong master id or something desynchronized. use the first wallet in the list as default
          if (!storedMasterId || !(storedMasterId in this.masterWallets)) {
              console.warn("Invalid master ID retrieved from storage. Using the first wallet as default");
              storedMasterId = Object.values(this.masterWallets)[0].id;
          }

          await this.setActiveMasterWalletId(storedMasterId);
        }

        this.events.publish("walletmanager:initialized");

        // Start the sync service if we are in a background service
        if (this.appService.runningAsAService()) {
            this.syncService.init(this);
        }
    }

    public getCurMasterWalletId() {
        return this.activeMasterWallet.id;
    }

    public setCurMasterWalletId(id) {
        this.setActiveMasterWalletId(id);
    }

    public getActiveMasterWallet(): MasterWallet {
        return this.activeMasterWallet;
    }

    public getMasterWallet(masterId: WalletID): MasterWallet {
        return this.masterWallets[masterId];
    }

    public walletNameExists(name: string): boolean {
        let existingWallet = Object.values(this.masterWallets).find((wallet)=>{
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
        }
        else {
            return null;
        }
    }

    /**
     * Creates a new master wallet both in the SPV SDK and in our local model.
     */
    public async createNewMasterWallet(masterId: WalletID, walletName: string, mnemonicStr: string, mnemonicPassword: string, payPassword: string, singleAddress: boolean) {
        console.log("Creating new master wallet");

        await this.spvBridge.createMasterWallet(masterId, mnemonicStr,mnemonicPassword, payPassword, singleAddress);

        let account: WalletAccount = {
            singleAddress: singleAddress,
            Type: WalletAccountType.STANDARD
        };

        await this.addMasterWalletToLocalModel(masterId, walletName, account);
    }

    /**
     * Creates a new master wallet both in the SPV SDK and in our local model, using a given mnemonic.
     */
    public async importMasterWalletWithMnemonic(masterId: WalletID, walletName: string, mnemonicStr: string, mnemonicPassword: string, payPassword: string, singleAddress: boolean) {
        console.log("Importing new master wallet with mnemonic");

        await this.spvBridge.importWalletWithMnemonic(masterId, mnemonicStr, mnemonicPassword, payPassword, singleAddress);

        let account: WalletAccount = {
            singleAddress: singleAddress,
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

        // Save state to local storage
        await this.saveMasterWallet(this.masterWallets[id]);

        // Set the newly created wallet as the active one.
        this.setActiveMasterWalletId(id);

        // Go to wallet's home page.
        this.native.setRootRouter("/wallet-home");
    }

    /**
     * Destroy a master wallet, active or not, base on its id
     */
    async destroyMasterWallet(id: string) {
        // Destroy the wallet in the wallet plugin
        await this.spvBridge.destroyWallet(id);

        // Save this modification to our permanent local storage
        await this.localStorage.setExtendedMasterWalletInfo(this.masterWallets[id].id, null);

        // Destroy from our local model
        delete this.masterWallets[id];

        if (this.activeMasterWallet.id === id) {
            this.activeMasterWallet = null;
            // TODO: we need more cleanup than this on the active wallet here!
        }

        // If there is at least one remaining wallet, select it as the new active wallet in the app.
        if (Object.values(this.masterWallets).length > 0) {
            this.setActiveMasterWalletId(Object.values(this.masterWallets)[0]);
        }
        else {
            this.goToLauncherScreen();
        }
    }

    /**
     * Save master wallets list to permanent local storage.
     */
    public async saveMasterWallet(masterWallet: MasterWallet) {
        let extendedInfo = masterWallet.getExtendedWalletInfo();
        console.log("Saving wallet extended info", masterWallet.id, extendedInfo);

        await this.localStorage.setExtendedMasterWalletInfo(masterWallet.id, extendedInfo);
    }

    public async setActiveMasterWalletId(id) {
        console.log("Setting active master wallet id", id);

        await this.localStorage.saveCurMasterId({ masterId: id });

        let activeMasterId = this.activeMasterWallet ? this.activeMasterWallet.id : null;
        if (id != activeMasterId) {
            /* TODO IN BG SERVICE if (this.activeMasterWallet)
                this.syncStopSubWallets(activeMasterId);*/

            this.activeMasterWallet = this.masterWallets[id];

            this.startWalletSync(id);
            // this.native.setRootRouter("/wallet-home");
        }
    }

    /**
     * Inform the background service (via RPC) that we want to start syncing a wallet.
     * If there is another wallet syncing, its on going sync will be stopped first.
     */
    public startWalletSync(masterId: WalletID) {
        console.log("Requesting sync service to start syncing wallet "+masterId);

        let messageParams: RPCStartWalletSyncParams = {
            masterId: masterId,
            chainIds: []
        };

        // Add only standard subwallets to SPV sync request
        for (let subWallet of Object.values(this.getMasterWallet(masterId).subWallets)) {
            if (subWallet.type == CoinType.STANDARD)
                messageParams.chainIds.push(subWallet.id as StandardCoinName);
        }

        let rpcMessage: InAppRPCMessage = {
            method: RPCMethod.START_WALLET_SYNC,
            params: messageParams
        }

        appManager.sendMessage("#service:walletservice", AppManagerPlugin.MessageType.INTERNAL, JSON.stringify(rpcMessage), ()=>{
            // Nothing to do
        }, (err)=>{
            console.log("Failed to send start RPC message to the sync service", err);
        });
    }

    // TODO: When wallet is destroyed
    private stopWalletSync(masterId: WalletID) {
        console.log("Requesting sync service to stop syncing wallet "+masterId);

        // Add only standard subwallets to SPV stop sync request
        let chainIds: StandardCoinName[] = [];
        for (let subWallet of Object.values(this.getMasterWallet(masterId).subWallets)) {
            if (subWallet.type == CoinType.STANDARD)
                chainIds.push(subWallet.id as StandardCoinName);
        }

        this.stopSubWalletsSync(masterId, chainIds);
    }

    private stopSubWalletsSync(masterId: WalletID, subWalletIds: StandardCoinName[]) {
        console.log("Requesting sync service to stop syncing some subwallets for wallet "+masterId);

        let messageParams: RPCStopWalletSyncParams = {
            masterId: masterId,
            chainIds: subWalletIds
        };

        let rpcMessage: InAppRPCMessage = {
            method: RPCMethod.STOP_WALLET_SYNC,
            params: messageParams
        }

        appManager.sendMessage("#service:walletservice", AppManagerPlugin.MessageType.INTERNAL, JSON.stringify(rpcMessage), ()=>{
            // Nothing to do
        }, (err)=>{
            console.log("Failed to send stop RPC message to the sync service");
        });
    }

    public stopSubWalletSync(masterId: WalletID, subWalletId: StandardCoinName) {
        this.stopSubWalletsSync(masterId, [subWalletId]);
    }

    /**
     * Start listening to all events from the SPV SDK.
     */
    public registerSubWalletListener() {
        // For now, don't listen to wallet events while in the service.
        if (this.appService.runningAsAService())
            return;

        console.log("Register wallet listener");

        this.spvBridge.registerWalletListener((event: SPVWalletMessage)=>{
            this.zone.run(() => {
                this.handleSubWalletEvent(event);
            });
        });
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
                this.updateSyncProgress(masterId, chainId, event);
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
              // Nothing to do for now
              break;
        }
    }

    /**
     * Updates the progress value of current wallet synchronization. This progress change
     * is saved into the model and triggers events so that the UI can update itself.
     */
    private updateSyncProgress(masterId: WalletID, chainId: StandardCoinName, result: SPVWalletMessage) {
        this.masterWallets[masterId].updateSyncProgress(chainId, result.Progress, result.LastBlockTime);

        if (!this.hasPromptTransfer2IDChain && (chainId === StandardCoinName.IDChain)) {
            let elaProgress = this.masterWallets[masterId].subWallets[StandardCoinName.ELA].progress
            let idChainProgress = this.masterWallets[masterId].subWallets[StandardCoinName.IDChain].progress

            // Check if it's a right time to prompt user for ID chain transfers, but only if we are fully synced.
            if (elaProgress == 100 && idChainProgress == 100) {
                this.checkIDChainBalance();
            }
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
    public checkIDChainBalance() {
        if (this.hasPromptTransfer2IDChain) { return; }
        if (this.needToPromptTransferToIDChain) { return; }

        // // IDChain not open, do not prompt
        // if (Util.isNull(this.masterWallet[this.curMasterId].subWallets[Config.IDCHAIN])) {
        //     return;
        // }

        if (this.getActiveMasterWallet().subWallets[StandardCoinName.ELA].balance <= 1000000) {
            console.log('ELA balance ', this.getActiveMasterWallet().subWallets[StandardCoinName.ELA].balance);
            return;
        }

        if (this.getActiveMasterWallet().subWallets[StandardCoinName.IDChain].balance > 100000) {
            console.log('IDChain balance ', this.getActiveMasterWallet().subWallets[StandardCoinName.IDChain].balance);
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

    private getTxCode(hash) {
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
     * Prompts and returns wallet password to user.
     */
    getPassword(transfer): Promise<string> {
        return new Promise(async (resolve, reject) => {
            const props = this.native.clone(transfer);
            const modal = await this.modalCtrl.create({
                component: PaymentboxComponent,
                componentProps: props
            });
            modal.onDidDismiss().then((params) => {
                if (params.data) {
                    resolve(params.data);
                } else {
                    resolve(null);
                }
            });
            modal.present();
        });
    }

    /**
     * Opens the payment popup with all the necessary transaction information.
     * Once password is entered by the user, a transaction is created and signed, then sent
     * for the SPV SDK for publishing.
     */
    async openPayModal(transfer) {
        const payPassword = await this.getPassword(transfer);
        if (payPassword === null) {
            return;
        }
        transfer.payPassword = payPassword;

        await this.native.showLoading();
        this.signAndSendTransaction(transfer);
    }

    /**
     * Signs raw transaction and sends the signed transaction to the SPV SDK for publication.
     */
    async signAndSendTransaction(transfer) {
        let signedTx = await this.spvBridge.signTransaction(this.activeMasterWallet.id,
                                           transfer.chainId,
                                           transfer.rawTransaction,
                                           transfer.payPassword);

        this.sendTransaction(transfer, signedTx);
    }

    private async sendTransaction(transfer, signedTx: SignedTransaction) {
        let publishedTransaction = await this.spvBridge.publishTransaction(this.activeMasterWallet.id, transfer.chainId, signedTx);

        if (!Util.isEmptyObject(transfer.action)) {
            this.lockTx(publishedTransaction.TxHash);

            setTimeout(() => {
                let txId = publishedTransaction.TxHash;
                const code = this.getTxCode(txId);
                if (code !== 0) {
                    txId = null;
                }
                this.native.hideLoading();
                this.native.toast_trans('send-raw-transaction');
                this.native.setRootRouter('/wallet-home');
                console.log('Sending intent response', transfer.action, {txid: txId}, transfer.intentId);
                appManager.sendIntentResponse(transfer.action, {txid: txId}, transfer.intentId);
            }, 5000); // wait for 5s for txPublished
        } else {
            console.log(publishedTransaction.TxHash);

            this.native.hideLoading();
            this.native.toast_trans('send-raw-transaction');
            this.native.setRootRouter('/wallet-home');
        }
    }
}
