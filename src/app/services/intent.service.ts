import { Events, NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { Native } from './native.service';
import { Config } from '../config/Config';
import { Util } from '../model/Util';
import { StandardCoinName } from '../model/Coin';
import { Injectable, NgZone } from '@angular/core';
import { CoinTransferService } from './cointransfer.service';
import { WalletManager } from './wallet.service';

declare let appManager: AppManagerPlugin.AppManager;

@Injectable({
    providedIn: 'root'
})
export class IntentService {
    constructor(private zone: NgZone, private translate: TranslateService, 
        public events: Events, public native: Native, private walletManager: WalletManager,
        private coinTransferService: CoinTransferService) {
    }

    public async init() {
        console.log("IntentService init");

        // Listen to incoming intents.
        this.setIntentListener();
    }

    setIntentListener() {
        appManager.setIntentListener((intent: AppManagerPlugin.ReceivedIntent)=>{
            this.onReceiveIntent(intent);
        });
    }

    onReceiveIntent(intent: AppManagerPlugin.ReceivedIntent) {
        console.log("Intent message receive:", intent.action, ". params: ", intent.params, ". from: ", intent.from);

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
            // TODO: send intent response
            return false;
        }

        this.coinTransferService.reset();
        this.coinTransferService.walletInfo = this.walletManager.activeMasterWallet.account;        
        this.coinTransferService.transfer.memo = intent.params.memo || '';
        this.coinTransferService.transfer.intentId = intent.intentId;
        this.coinTransferService.transfer.action = intent.action;
        this.coinTransferService.transfer.from = intent.from;
        this.coinTransferService.transfer.payPassword = '';
        this.coinTransferService.transfer.fee = 0;
        this.coinTransferService.transfer.chainId = StandardCoinName.ELA;

        let continueToWaitForSync = true;
        switch (intent.action) {
            case 'crmembervote':
                console.log('CR member vote Transaction intent content:', intent.params);
                this.coinTransferService.transfer.votes = intent.params.votes;
                this.coinTransferService.transfer.invalidCandidates = intent.params.invalidCandidates || '[]';
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
                this.coinTransferService.transfer.chainId = StandardCoinName.IDChain;
                this.coinTransferService.transfer.amount = intent.params.amount;
                this.coinTransferService.transfer.publickey = intent.params.publickey;
                break;

            case 'dposvotetransaction':
                console.log('DPOS Transaction intent content:', intent.params);
                this.coinTransferService.transfer.toAddress = 'default';
                this.coinTransferService.transfer.publicKeys = intent.params.publickeys;
                break;

            case 'didtransaction':
                this.coinTransferService.transfer.chainId = StandardCoinName.IDChain;
                this.coinTransferService.transfer.didrequest = intent.params.didrequest;
                break;

            case 'pay':
                this.coinTransferService.transfer.toAddress = intent.params.receiver;
                this.coinTransferService.transfer.amount = intent.params.amount;
                this.coinTransferService.transfer.type = 'payment-confirm';
                break;

            case 'createproposaldigest':
                continueToWaitForSync = false;
                this.handleCreateProposalDigestIntent(intent);
                break;

            default:
                console.log('AppService unknown intent:', intent);
                return;
        }

        if (continueToWaitForSync)
            this.native.go('/waitforsync');
    }

    handleAccessIntent(intent: AppManagerPlugin.ReceivedIntent) {
        Config.requestDapp = {
            name: intent.from,
            intentId: intent.intentId,
            action: intent.action,
            requestFields: intent.params.reqfields || intent.params,
        };
        this.native.go('/access');
    }

    sendIntentResponse(action, result, intentId) {
        appManager.sendIntentResponse(action, result, intentId, () => {
        }, (err) => {
            console.error('sendIntentResponse error!', err);
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
            this.sendIntentResponse("createproposaldigest", {digest: digest}, intent.intentId);
        }
        else {
            // This is a silent intent, app will close right after calling sendIntentresponse()
            this.sendIntentResponse("createproposaldigest", "Missing proposal input parameter in the intent", intent.intentId);
        }
    }
}
