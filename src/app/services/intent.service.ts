import { Events, NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { Native } from './native.service';
import { Config } from '../config/Config';
import { Util } from '../model/Util';
import { StandardCoinName } from '../model/Coin';
import { Injectable, NgZone } from '@angular/core';
import { CoinTransferService, TransferType } from './cointransfer.service';
import { WalletAccessService } from './walletaccess.service';
import { WalletManager } from './wallet.service';
import { MasterWallet } from '../model/MasterWallet';

declare let appManager: AppManagerPlugin.AppManager;

@Injectable({
    providedIn: 'root'
})
export class IntentService {

    private walletList: MasterWallet [] = null;

    constructor(
        private zone: NgZone,
        public events: Events,
        public native: Native,
        private walletManager: WalletManager,
        private coinTransferService: CoinTransferService,
        private walletAccessService: WalletAccessService
    ) {
    }

    public async init() {
        console.log("IntentService init");

        // Listen to incoming intents.
        this.setIntentListener();
    }

    setIntentListener() {
        appManager.setIntentListener((intent: AppManagerPlugin.ReceivedIntent) => {
            this.onReceiveIntent(intent);
        });
    }

    onReceiveIntent(intent: AppManagerPlugin.ReceivedIntent) {
        console.log(
            "Intent message receive:", intent.action,
            ". params: ", intent.params,
            ". from: ", intent.from
        );

        this.walletList = this.walletManager.getWalletsList();
        if (this.walletList.length === 0) {
            this.sendIntentResponse(intent.action, "No active master wallet!", intent.intentId);
            return false;
        }

        switch (intent.action) {
            case 'elawalletmnemonicaccess':
            case 'walletaccess':
                this.handleAccessIntent(intent);
                break;
            default:
                this.handleTransactionIntent(intent);
                break;
        }
    }

    handleTransactionIntent(intent: AppManagerPlugin.ReceivedIntent) {
        if (Util.isEmptyObject(intent.params)) {
            console.error('Invalid intent parameters received. No params.', intent.params);
            this.sendIntentResponse(intent.action, "Invalid intent parameters", intent.intentId);
            return false;
        } else {
            this.coinTransferService.reset();
            this.coinTransferService.chainId = StandardCoinName.ELA;
            this.coinTransferService.intentTransfer = {
                action: intent.action,
                intentId: intent.intentId,
                from: intent.from,
            };
        }

        switch (intent.action) {
            case 'crmembervote':
                console.log('CR member vote Transaction intent content:', intent.params);
                this.coinTransferService.transfer.votes = intent.params.votes;
                break;

            case 'crmemberregister':
                console.log('CR member register Transaction intent content:', intent.params);
                this.coinTransferService.transfer.did = intent.params.did;
                this.coinTransferService.transfer.nickname = intent.params.nickname;
                this.coinTransferService.transfer.url = intent.params.url;
                this.coinTransferService.transfer.location = intent.params.location;
                break;

            case 'crmemberupdate':
                console.log('CR member update Transaction intent content:', intent.params);
                this.coinTransferService.transfer.nickname = intent.params.nickname;
                this.coinTransferService.transfer.url = intent.params.url;
                this.coinTransferService.transfer.location = intent.params.location;
                break;

            case 'crmemberunregister':
                console.log('CR member unregister Transaction intent content:', intent.params);
                this.coinTransferService.transfer.crDID = intent.params.crDID;
                break;

            case 'crmemberretrieve':
                console.log('CR member retrieve Transaction intent content:', intent.params);
                this.coinTransferService.chainId = StandardCoinName.IDChain;
                this.coinTransferService.transfer.amount = intent.params.amount;
                this.coinTransferService.transfer.publickey = intent.params.publickey;
                break;

            case 'dposvotetransaction':
                console.log('DPOS Transaction intent content:', intent.params);
                this.coinTransferService.publickeys = intent.params.publickeys;
                break;

            case 'didtransaction':
                this.coinTransferService.chainId = StandardCoinName.IDChain;
                this.coinTransferService.didrequest = intent.params.didrequest;
                break;

            case 'esctransaction':
                this.coinTransferService.chainId = StandardCoinName.ETHSC;
                this.coinTransferService.didrequest = intent.params.didrequest;
                break;

            case 'pay':
                this.coinTransferService.chainId = this.getChainIDByCurrency(intent.params.currency || 'ELA');
                this.coinTransferService.transferType = TransferType.PAY;

                this.coinTransferService.payTransfer = {
                    toAddress: intent.params.receiver,
                    amount: intent.params.amount,
                    memo: intent.params.memo
                };
                break;

            case 'crproposalcreatedigest':
                this.handleCreateProposalDigestIntent(intent);
                break;

            case 'crproposalvoteagainst':
                this.handleVoteAgainstProposalIntent(intent);
                break;

            default:
                console.log('AppService unknown intent:', intent);
                return;
        }
        if (this.walletList.length === 1) {
            const masterWallet = this.walletList[0];
            this.coinTransferService.masterWalletId = masterWallet.id;
            this.coinTransferService.walletInfo = masterWallet.account;
            this.native.go("/waitforsync");
        } else {
            this.native.go('wallet-manager', { forIntent: true, forWalletAccess: false });
        }
    }

    handleAccessIntent(intent: AppManagerPlugin.ReceivedIntent) {
        this.walletAccessService.reset();
        this.walletAccessService.intentTransfer = {
            action: intent.action,
            intentId: intent.intentId,
            from: intent.from,
        };
        this.walletAccessService.requestFields = intent.params.reqfields || intent.params;
        if (this.walletList.length === 1) {
            const masterWallet = this.walletList[0];
            this.walletAccessService.masterWalletId = masterWallet.id;
            this.native.go("/access");
        } else {
            this.native.go('wallet-manager', { forIntent: true, forWalletAccess: true });
        }
    }

    private async handleVoteAgainstProposalIntent(intent: AppManagerPlugin.ReceivedIntent) {
        console.log("Handling vote against proposal intent");

        // Let the screen know for which proposal we want to vote against
        this.coinTransferService.transfer.votes = [
            intent.params.proposalHash
        ];
    }

    sendIntentResponse(action, result, intentId): Promise<void> {
        return new Promise((resolve, reject) => {
            appManager.sendIntentResponse(action, result, intentId, () => {
                resolve();
            }, (err) => {
                console.error('sendIntentResponse error!', err);
                reject(err);
            });
        });
    }

    /**
     * Intent that gets a CR proposal object as input and returns a HEX digest of it.
     * Usually used to create a digest representation of a proposal before signing it and/or
     * publishing it in a transaction.
     */
    private async handleCreateProposalDigestIntent(intent: AppManagerPlugin.ReceivedIntent) {
        console.log("Handling create proposal digest silent intent");

        if (intent && intent.params && intent.params.proposal) {
            let masterWalletID = await this.walletManager.getCurrentMasterIdFromStorage();
            let digest = await this.walletManager.spvBridge.proposalOwnerDigest(masterWalletID, StandardCoinName.ELA, intent.params.proposal);

            // This is a silent intent, app will close right after calling sendIntentresponse()
            this.sendIntentResponse("crproposalcreatedigest", {digest: digest}, intent.intentId);
        }
        else {
            // This is a silent intent, app will close right after calling sendIntentresponse()
            this.sendIntentResponse("crproposalcreatedigest", "Missing proposal input parameter in the intent", intent.intentId);
        }
    }

    private getChainIDByCurrency(currency: string) {
        let chainID = StandardCoinName.ELA;
        switch (currency) {
            case 'IDChain':
            case 'ELA/ID':
                chainID = StandardCoinName.IDChain;
                break;
            case 'ETHSC':
            case 'ELA/ETHSC':
                chainID = StandardCoinName.ETHSC;
                break;
            default:
                break;
        }
        return chainID;
    }
}
