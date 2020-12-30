import { Events } from '@ionic/angular';
import { Native } from './native.service';
import { Util } from '../model/Util';
import { StandardCoinName } from '../model/Coin';
import { Injectable, NgZone } from '@angular/core';
import { CoinService } from 'src/app/services/coin.service';
import { CoinTransferService, TransferType } from './cointransfer.service';
import { WalletAccessService } from './walletaccess.service';
import { WalletManager } from './wallet.service';
import { MasterWallet } from '../model/wallets/MasterWallet';
import { WalletEditionService } from './walletedition.service';

declare let appManager: AppManagerPlugin.AppManager;
declare let titleBarManager: TitleBarPlugin.TitleBarManager;

@Injectable({
    providedIn: 'root'
})
export class IntentService {

    private walletList: MasterWallet [] = null;

    constructor(
        public events: Events,
        public native: Native,
        private walletManager: WalletManager,
        private coinService: CoinService,
        private coinTransferService: CoinTransferService,
        private walletAccessService: WalletAccessService,
        private walletEditionService: WalletEditionService
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

    async onReceiveIntent(intent: AppManagerPlugin.ReceivedIntent) {
        console.log(
            "Intent message received:", intent.action,
            ". params: ", intent.params,
            ". from: ", intent.from
        );

        this.walletList = this.walletManager.getWalletsList();
        if (this.walletList.length === 0) {
            await this.sendIntentResponse(intent.action, {message: 'No active master wallet!', status: 'error'}, intent.intentId);
            return false;
        }

        titleBarManager.setNavigationMode(TitleBarPlugin.TitleBarNavigationMode.CLOSE);

        switch (this.getShortAction(intent.action)) {
            case 'elawalletmnemonicaccess':
            case 'walletaccess':
                this.handleAccessIntent(intent);
                break;
            case 'addcoin':
                this.handleAddCoinIntent(intent);
                break;
            default:
                this.handleTransactionIntent(intent);
                break;
        }
    }

    /**
     * From a full new-style action string such as https://wallet.elastos.net/pay,
     * returns the short old-style action "pay" for convenience.
     */
    private getShortAction(fullAction: string): string {
        const intentDomainRoot = "https://wallet.elastos.net/";
        return fullAction.replace(intentDomainRoot, "");
    }

    async handleTransactionIntent(intent: AppManagerPlugin.ReceivedIntent) {
        if (Util.isEmptyObject(intent.params)) {
            console.error('Invalid intent parameters received. No params.', intent.params);
            await this.sendIntentResponse(intent.action, "Invalid intent parameters", intent.intentId);
            return false;
        } else {
            this.coinTransferService.reset();
            this.coinTransferService.chainId = StandardCoinName.ELA;
            this.coinTransferService.intentTransfer = {
                action: this.getShortAction(intent.action),
                intentId: intent.intentId,
                from: intent.from,
            };
        }

        switch (this.getShortAction(intent.action)) {
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
                this.coinTransferService.payloadParam = intent.params.payload.params[0];
                // this.coinTransferService.amount = intent.params.amount;
                break;

            case 'pay':
                const intentChainId = this.getChainIDByCurrency(intent.params.currency || 'ELA');
                if (intentChainId) {
                    this.coinTransferService.chainId = intentChainId;
                } else {
                    await this.sendIntentResponse(
                        'pay',
                        { message: 'Not support Token:' + intent.params.currency, status: 'error' },
                        intent.intentId
                    );

                    return;
                }

                this.coinTransferService.transferType = TransferType.PAY;
                this.coinTransferService.payTransfer = {
                    toAddress: intent.params.receiver,
                    amount: intent.params.amount,
                    memo: intent.params.memo || ""
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
            this.native.setRootRouter('/waitforsync', {rootPage: true});
        } else {
            this.native.setRootRouter('select-subwallet');
        }
    }

    handleAddCoinIntent(intent: AppManagerPlugin.ReceivedIntent) {
        this.walletEditionService.reset();
        this.walletEditionService.intentTransfer = {
            action: this.getShortAction(intent.action),
            intentId: intent.intentId,
            from: intent.from,
        };

        if (this.walletList.length === 1) {
            const masterWallet = this.walletList[0];
            this.walletEditionService.modifiedMasterWalletId = masterWallet.id;
            this.native.setRootRouter("/coin-add-erc20", { contract: intent.params.contract, rootPage: true });
        } else {
            this.native.setRootRouter(
                'wallet-manager',
                {
                    forIntent: true,
                    intent: 'addcoin',
                    intentParams: intent.params
                }
            );
        }
    }

    handleAccessIntent(intent: AppManagerPlugin.ReceivedIntent) {
        this.walletAccessService.reset();
        this.walletAccessService.intentTransfer = {
            action: this.getShortAction(intent.action),
            intentId: intent.intentId,
            from: intent.from,
        };
        this.walletAccessService.requestFields = intent.params.reqfields || intent.params;
        if (this.walletList.length === 1) {
            const masterWallet = this.walletList[0];
            this.walletAccessService.masterWalletId = masterWallet.id;
            this.native.setRootRouter('/access', { rootPage: true});
        } else {
            this.native.setRootRouter(
                'wallet-manager',
                {
                    forIntent: true,
                    intent: 'access',
                    intentParams: intent.params
                }
            );
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
            await this.sendIntentResponse("crproposalcreatedigest", {digest: digest}, intent.intentId);
        }
        else {
            // This is a silent intent, app will close right after calling sendIntentresponse()
            await this.sendIntentResponse("crproposalcreatedigest", {message: "Missing proposal input parameter in the intent", status: 'error'}, intent.intentId);
        }
    }

    private getChainIDByCurrency(currency: string) {
        let chainID = StandardCoinName.ELA;
        switch (currency) {
            case 'ELA':
                chainID = StandardCoinName.ELA;
                break;
            case 'IDChain':
            case 'ELA/ID':
                chainID = StandardCoinName.IDChain;
                break;
            case 'ETHSC':
            case 'ELA/ETHSC':
                chainID = StandardCoinName.ETHSC;
                break;
            default:
                if (currency.startsWith('ELA/ETHSC:')) {
                    chainID = currency.substring(10) as StandardCoinName;
                    const coin = this.coinService.getCoinByID(chainID);
                    if (!coin) {
                        chainID = null;
                        console.log('Not support coin:', currency);
                    }
                } else {
                    chainID = null;
                    console.log('Not support coin:', currency);
                }
                break;
        }
        return chainID;
    }
}
