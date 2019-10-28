import { Component, OnInit } from '@angular/core';
import { ModalController, Events } from '@ionic/angular';
import { WalletManager } from '../../../services/WalletManager';
import { Native } from '../../../services/Native';
import { LocalStorage } from '../../../services/Localstorage';
import { Config } from '../../../services/Config';

@Component({
    selector: 'app-coin-list',
    templateUrl: './coin-list.page.html',
    styleUrls: ['./coin-list.page.scss'],
})
export class CoinListPage implements OnInit {
    masterWalletId: string = "1";
    coinList = [];
    coinListCache = {};
    payPassword: string = "";
    singleAddress: boolean = false;
    currentCoin: any;
    constructor(public walletManager: WalletManager,
        public native: Native, public localStorage: LocalStorage, public modalCtrl: ModalController, public events: Events) {
        this.init();
    }

    ngOnInit() {
    }

    onSelect(item, open) {
        item.open = open;
        this.native.info(item);

        this.currentCoin = item;
        this.native.showLoading().then(() => {
            if (item.open) {
                this.createSubWallet(item.name);
            }
            else {
                this.destroySubWallet(item.name);
            }
        });
    }

    init() {
        this.events.subscribe("error:update", () => {
            this.currentCoin["open"] = false;
        });
        this.events.subscribe("error:destroySubWallet", () => {
            this.currentCoin["open"] = true;
        });
        // this.masterWalletId = Config.getCurMasterWalletId();
        this.masterWalletId = Config.modifyId;
        // let subWallet = Config.getSubWallet(this.masterWalletId);
        this.walletManager.getSupportedChains(this.masterWalletId, (data) => {
            this.native.hideLoading();
            let subWallet = Config.masterManager.masterWallet[this.masterWalletId].chainList;
            for (let index in data) {
                let chain = data[index];
                let isOpen = false;
                if (chain == "ELA") {
                    isOpen = true;
                }
                else if (subWallet) {
                    isOpen =  subWallet.indexOf(chain) != -1;
                }
                this.coinList.push({ name: chain, open: isOpen });
            }
        });
    }

    createSubWallet(chainId) {
        // Sub Wallet IDChain
        this.walletManager.createSubWallet(this.masterWalletId, chainId, 0, (data) => {
            this.native.hideLoading();
            Config.masterManager.addSubWallet(this.masterWalletId, chainId);
            Config.masterManager.saveInfos();
        },
            () => this.currentCoin["open"] = false
        );
    }

    destroySubWallet(chainId) {
        this.walletManager.destroySubWallet(this.masterWalletId, chainId, () => {
            Config.masterManager.removeSubWallet(this.masterWalletId, chainId);
            Config.masterManager.saveInfos();
            this.native.hideLoading();
        });
    }

    ionViewDidLeave() {
        this.events.unsubscribe("error:update");
        this.events.unsubscribe("error:destroySubWallet");
    }

}
