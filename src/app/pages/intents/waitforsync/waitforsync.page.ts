import { Component, NgZone, OnInit } from '@angular/core';
import { Events } from '@ionic/angular';
import { AppService } from '../../../services/app.service';
import { Config } from '../../../config/Config';
import { Native } from '../../../services/native.service';
import { PopupProvider } from '../../../services/popup.service';
import { WalletManager } from 'src/app/services/wallet.service';
import { MasterWallet } from 'src/app/model/MasterWallet';
import { CoinTransferService, IntentTransfer } from 'src/app/services/cointransfer.service';
import { StandardCoinName } from 'src/app/model/Coin';
import { IntentService } from 'src/app/services/intent.service';
import { ThemeService } from 'src/app/services/theme.service';
import { CurrencyService } from 'src/app/services/currency.service';

declare let appManager: AppManagerPlugin.AppManager;

@Component({
  selector: 'app-waitforsync',
  templateUrl: './waitforsync.page.html',
  styleUrls: ['./waitforsync.page.scss'],
})
export class WaitForSyncPage implements OnInit {

    Config = Config;
    SELA = Config.SELA;
    showOn = true;

    masterWallet: MasterWallet = null;
    intentTransfer: IntentTransfer = null;
    transfer: any = null;

    chainId: StandardCoinName;
    txId: string;
    walletInfo = {};

    eventType = '';
    action = '';
    nextScreen = '';


    constructor(
        public appService: AppService,
        public native: Native,
        public events: Events,
        public zone: NgZone,
        private intentService: IntentService,
        private coinTransferService: CoinTransferService,
        private walletManager: WalletManager,
        public popupProvider: PopupProvider,
        public theme: ThemeService,
        public currencyService: CurrencyService
    ) {
    }

    ngOnInit() {
        this.zone.run(() => {
            this.init();
        });
    }

    ionViewWillEnter() {
        this.appService.setTitleBarTitle('Syncing');
        appManager.setVisible("show", () => {}, (err) => {});
    }

    async init() {
        this.intentTransfer = this.coinTransferService.intentTransfer;
        this.transfer = this.coinTransferService.transfer;
        this.chainId = this.coinTransferService.chainId;
        this.walletInfo = this.coinTransferService.walletInfo;
        this.masterWallet = this.walletManager.getActiveMasterWallet();

        console.log("Wait for sync - Master wallet:", this.masterWallet, "Chain ID:", this.chainId);

        switch (this.intentTransfer.action) {
            case 'crmembervote':
                this.action = 'text-vote-crcouncil';
                this.nextScreen = '/crmembervote';
                break;
            case 'crmemberregister':
                this.action = 'text-crmember-register';
                this.nextScreen = '/crmemberregister';
                break;
            case 'crmemberunregister':
                this.action = 'text-crmember-unregister';
                this.nextScreen = '/crmemberregister';
                break;
            case 'crmemberupdate':
                this.action = 'text-crmember-update';
                this.nextScreen = '/crmemberregister';
                break;
            case 'crmemberretrieve':
                this.action = 'text-crmember-retrieve';
                this.nextScreen = '/crmemberregister';
                break;
            case 'didtransaction':
                this.action = 'text-did';
                this.nextScreen = '/didtransaction';
                break;
            case 'esctransaction':
                this.action = 'text-esc';
                this.nextScreen = '/esctransaction';
                break;
            case 'dposvotetransaction':
                this.action = 'text-dposvote';
                this.nextScreen = '/dposvote';
                break;
            case 'pay':
                this.action = 'text-transfer';
                this.nextScreen = '/coin-transfer';
                break;
            case 'crproposalvoteagainst':
                this.action = 'Vote against proposal';
                this.nextScreen = '/crproposalvoteagainst';
                break;
            default:
                console.log('pls check the action - '+this.transfer.action+' is not supported.');
                break;
        }

        // TODO: remove it, IDChain is open always?
        if (this.chainId === StandardCoinName.IDChain) {
            if (!this.masterWallet.hasSubWallet(StandardCoinName.IDChain)) {
                await this.notifyNoIDChain();
                this.cancelOperation();
                return;
            }
        }

        if (this.walletManager.activeMasterWallet.subWallets[this.chainId].progress !== 100) {
            this.eventType = this.chainId + ':synccompleted';
            this.events.subscribe(this.eventType, (coin) => {
                console.log('WaitforsyncPage coin:', coin);
                this.doAction();
                this.events.unsubscribe(this.eventType);
            });
        } else {
            setTimeout(() => {
                this.doAction();
            }, 1000);
        }
    }

    notifyNoIDChain() {
        return this.popupProvider.ionicAlert('confirmTitle', 'no-open-side-chain');
    }

    doAction() {
        this.native.setRootRouter(this.nextScreen);
    }

    async cancelOperation() {
        await this.intentService.sendIntentResponse(this.intentTransfer.action, {txid: null}, this.intentTransfer.intentId);
        this.appService.close();
    }

    getLoadingDots(): string {
        let dots = '';
        setInterval(() => {
            dots += '.';
        }, 100);
        return dots;
    }

    getSubWalletIcon(): string {
        switch (this.chainId) {
            case 'ELA':
                return "assets/coins/ela-black.svg";
            case 'IDChain':
                return "assets/coins/ela-turquoise.svg";
            case 'ETHSC':
                return "assets/coins/ela-gray.svg";
            default:
                return "assets/coins/eth.svg";
        }
    }
}
