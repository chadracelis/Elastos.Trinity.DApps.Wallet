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

import { Component, OnInit, NgZone } from '@angular/core';
import { AppService } from '../../../services/app.service';
import { Config } from '../../../config/Config';
import { Native } from '../../../services/native.service';
import { PopupProvider } from '../../../services/popup.Service';
import { WalletManager, CoinName } from '../../../services/wallet.service';

declare let appManager: AppManagerPlugin.AppManager;

@Component({
    selector: 'app-didtransaction',
    templateUrl: './didtransaction.page.html',
    styleUrls: ['./didtransaction.page.scss'],
})
export class DidTransactionPage implements OnInit {
    masterWalletId = '1';
    transfer: any = null;

    balance: number; // ELA

    chainId: string; // IDChain
    hasOpenIDChain = false;
    walletInfo = {};

    constructor(public walletManager: WalletManager, public appService: AppService, public popupProvider: PopupProvider,
                public native: Native, public zone: NgZone) {
        this.init();
    }

    ngOnInit() {
    }

    ionViewDidEnter() {
      if (this.walletInfo["Type"] === "Multi-Sign") {
          // TODO: reject didtransaction if multi sign (show error popup)
          this.appService.close();
      }

      appManager.setVisible("show", ()=>{}, (err)=>{});
    }

    init() {
        console.log(this.walletManager.coinObj);
        this.transfer = this.walletManager.coinObj.transfer;
        this.chainId = this.walletManager.coinObj.transfer.chainId;
        this.walletInfo = this.walletManager.coinObj.walletInfo;
        this.masterWalletId = this.walletManager.getCurMasterWalletId();
        if (this.chainId === CoinName.IDCHAIN) {
            let coinList = this.walletManager.getSubWalletList();
            if (coinList.length === 1) { // for now, just IDChain
                this.hasOpenIDChain = true;
                this.balance = this.walletManager.masterWallets[this.masterWalletId].subWallets[this.chainId].balance / Config.SELA;
            } else {
                this.hasOpenIDChain = false;
                this.confirmOpenIDChain();
            }
        }
    }

    /**
     * Cancel the vote operation. Closes the screen and goes back to the calling application after
     * sending the intent response.
     */
    cancelOperation() {
        this.appService.sendIntentResponse(this.transfer.action, {txid: null}, this.transfer.intentId);
        this.appService.close();
    }

    goTransaction() {
        this.checkValue();
    }

    confirmOpenIDChain() {
        if (!this.hasOpenIDChain) {
            this.popupProvider.ionicAlert('confirmTitle', 'no-open-side-chain');
        }
        return this.hasOpenIDChain;
    }
    checkValue() {
        if (!this.confirmOpenIDChain()) {
            return;
        }

        if (this.balance < 0.0002) {
            this.popupProvider.ionicAlert('confirmTitle', 'text-did-balance-not-enough');
            return;
        }

        this.createIDTransaction();
    }

    createIDTransaction() {
        console.log("Calling createIdTransaction(): ", this.transfer.didrequest, this.transfer.memo)
        this.walletManager.spvBridge.createIdTransaction(this.masterWalletId, this.chainId,
            this.transfer.didrequest,
            this.transfer.memo,
            (data) => {
                console.log("Created raw DID transaction:", data);
                this.transfer.rawTransaction = data;
                this.walletManager.openPayModal(this.transfer);
            });
    }
}

