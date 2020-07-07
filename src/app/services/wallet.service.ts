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
import { MasterWallet, WalletID, CoinName } from '../model/MasterWallet';
import { SubWallet } from '../model/SubWallet';
import { Transfer } from '../model/Transfer';

declare let appManager: AppManagerPlugin.AppManager;
declare let notificationManager: NotificationManagerPlugin.NotificationManager;

export class WalletObjTEMP {
    masterId: string;
    mnemonicStr: string;
    mnemonicList: any[];
    mnemonicPassword: string;
    payPassword: string;
    singleAddress: boolean;
    isMulti: boolean;
    name: string;
}

export class CoinObjTEMP {
    transfer: Transfer; // TODO: messy class that embeds too many unrelated things...
    walletInfo: any; // TODO: type
}

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

    public walletObj: WalletObjTEMP; // TODO: Rework this - what is this object? active wallet? Define a type.
    public coinObj: CoinObjTEMP; // TODO - Type. Temporary coin context shared by screens.

    public subWallet: {
        ELA: SubWallet
    };

    public transactionMap: TransactionMap = {}; // when sync over, need to cleanup transactionMap

    public hasPromptTransfer2IDChain = true;

    public hasSendSyncCompletedNotification = {ELA: false, IDChain: false};
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
                this.masterWallets[masterId] = new MasterWallet(this, masterId);

                // Try to retrieve locally storage extended info about this wallet
                let extendedInfo = await this.localStorage.getExtendedMasterWalletInfos(masterId);
                if (extendedInfo) {
                    console.log("Found extended wallet info for master wallet id "+masterId, extendedInfo);
                    this.masterWallets[masterId].name = extendedInfo.name;
                }

                await this.masterWallets[masterId].populateMasterWalletSPVInfo();
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

        this.events.publish("walletmanager:initialized");
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

    public async addMasterWallet(id, name) {
        // Add a new wallet to our local model
        this.masterWallets[id] = new MasterWallet(id, name);
        await this.saveMasterWallets();

        await this.masterWallets[id].populateMasterWalletSPVInfo();

        // Set the newly created wallet as the active one.
        this.setActiveMasterWalletId(id);

        // Go to wallet's home page.
        this.native.setRootRouter("/wallet-home/wallet-tab-home");
    }

    /**
     * Destroy a master wallet, active or not, base on its id
     */
    async destroyMasterWallet(id: string) {
        // Destroy the wallet in the wallet plugin
        await this.spvBridge.destroyWallet(id);

        // Destroy from our local model
        delete this.masterWallets[id];
      
        if (this.activeMasterWallet.id === id) {
            this.activeMasterWallet = null;
            // TODO: we need more cleanup than this on the active wallet here!
        }

        // Save this modification to our permanent local storage
        await this.saveMasterWallets();

        // If there is at least one remaining wallet, select it as the new active wallet in the app.
        if (Object.values(this.masterWallets).length > 0) {
            this.setActiveMasterWalletId(Object.values(this.masterWallets)[0]);
        }
        else {
            this.goToLauncherScreen();
        }
    }

    public async createSubWallet(masterId: WalletID, chainId: CoinName) {
        await this.masterWallets[masterId].populateSubWallet(chainId);
    }

    /**
     * Removes a subwallet (coin - ex: ela, idchain) from the given wallet.
     */
    public async destroySubWallet(masterId: WalletID, chainId: CoinName) {
        await this.spvBridge.destroySubWallet(masterId, chainId);
        
        // Delete the subwallet from out local model.
        delete this.masterWallets[masterId].subWallets[chainId];

        await this.saveMasterWallets();
    }

    /**
     * Save master wallets list to permanent local storage.
     */
    public async saveMasterWallets() {
        for (let masterWallet of Object.values(this.masterWallets)) {
            await this.localStorage.setExtendedMasterWalletInfo(masterWallet.id, {
                name: masterWallet.name
            });
        }
    }

    private async syncStartSubWallets(masterId: WalletID) {
        this.masterWallets[masterId].startSubWalletsSync();
    }

    private syncStopSubWallets(masterId: WalletID) {
        this.masterWallets[masterId].stopSubWalletsSync();
    }

    public async setActiveMasterWalletId(id) {
        console.log("Setting active master wallet id", id);

        await this.localStorage.saveCurMasterId({ masterId: id });

        let activeMasterId = this.activeMasterWallet ? this.activeMasterWallet.id : null;
        if (id != activeMasterId) {
            if (this.activeMasterWallet)
                this.syncStopSubWallets(activeMasterId);

            this.activeMasterWallet = this.masterWallets[id];
            this.syncStartSubWallets(id);
            this.native.setRootRouter("/wallet-home/wallet-tab-home");
        }
    }

    /**
     * Start listening to all events from the SPV SDK.
     */
    public registerSubWalletListener(masterId: WalletID, chainId: CoinName) {
        console.log("Register sub-wallet listener for", masterId, chainId);

        this.spvBridge.registerWalletListener(masterId, chainId, (event: SPVWalletMessage)=>{
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

        switch (event.Action) {
            case "OnTransactionStatusChanged":
                // console.log('OnTransactionStatusChanged ', result);
                if (this.transactionMap[event.txId]) {
                    this.transactionMap[event.txId].Status = event.status;
                }
                break;
            case "OnBlockSyncStarted":
                break;
            case "OnBlockSyncProgress":
                // console.log('OnBlockSyncProgress ', result);
                this.updateSyncProgress(masterId, chainId, event);
                break;
            case "OnBlockSyncStopped":
                break;
            case "OnBalanceChanged":
                // console.log('OnBalanceChanged ', result);
                this.updateWalletBalance(masterId, chainId);
                break;
            case "OnTxPublished":
                // console.log('OnTxPublished ', result);
                this.handleTransactionPublishedEvent(event);
                break;
            case "OnAssetRegistered":
                break;
            case "OnConnectStatusChanged":
                break;
        }
    }

    /**
     * Updates the progress value of current wallet synchronization. This progress change
     * is saved into the model and triggers events so that the UI can update itself.
     */
    private updateSyncProgress(masterId: WalletID, chainId: CoinName, result: SPVWalletMessage) {
        this.masterWallets[masterId].updateSyncProgress(chainId, result.Progress, result.LastBlockTime);

        if (!this.hasPromptTransfer2IDChain && (chainId === CoinName.IDCHAIN)) {
            let elaProgress = this.masterWallets[masterId].subWallets[CoinName.ELA].progress
            let idChainProgress = this.masterWallets[masterId].subWallets[CoinName.IDCHAIN].progress

            // Check if it's a right time to prompt user for ID chain transfers, but only if we are fully synced.
            if (elaProgress == 100 && idChainProgress == 100) {
                this.checkIDChainBalance();
            }
        }
    }

    /**
     * Requests a wallet to update its balance. Usually called when we receive an event from the SPV SDK,
     * saying that a new balance amount is available.
     */
    private updateWalletBalance(masterId: WalletID, chainId: CoinName) {
        this.masterWallets[masterId].updateWalletBalance(chainId);
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

    public checkIDChainBalance() {
        if (this.hasPromptTransfer2IDChain) { return; }
        if (this.needToPromptTransferToIDChain) { return; }

        // // IDChain not open, do not prompt
        // if (Util.isNull(this.masterWallet[this.curMasterId].subWallets[Config.IDCHAIN])) {
        //     return;
        // }

        if (this.getActiveMasterWallet().subWallets[CoinName.ELA].balance <= 1000000) {
            console.log('ELA balance ', this.getActiveMasterWallet().subWallets[CoinName.ELA].balance);
            return;
        }

        if (this.getActiveMasterWallet().subWallets[CoinName.IDCHAIN].balance > 100000) {
            console.log('IDChain balance ', this.getActiveMasterWallet().subWallets[CoinName.IDCHAIN].balance);
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
                this.native.setRootRouter('/wallet-home/wallet-tab-home');
                console.log('Sending intent response', transfer.action, {txid: txId}, transfer.intentId);
                appManager.sendIntentResponse(transfer.action, {txid: txId}, transfer.intentId);
            }, 5000); // wait for 5s for txPublished
        } else {
            console.log(publishedTransaction.TxHash);

            this.native.hideLoading();
            this.native.toast_trans('send-raw-transaction');
            this.native.setRootRouter('/wallet-home/wallet-tab-home');
        }
    }

    /**
     * Sends a system notification inside elastOS when the wallet completes his synchronization for the first time.
     * This way, users know when they can start using their wallet in third party apps.
     */
    sendSyncCompletedNotification(chainId) {
      if (this.hasSendSyncCompletedNotification[chainId] === false) {
        console.log('sendSyncCompletedNotification:', chainId);

        const request: NotificationManagerPlugin.NotificationRequest = {
          key: chainId + '-syncCompleted',
          title: chainId + ': ' + this.translate.instant('sync-completed'),
        };
        notificationManager.sendNotification(request);

        this.hasSendSyncCompletedNotification[chainId] = true;
      }
    }
}
