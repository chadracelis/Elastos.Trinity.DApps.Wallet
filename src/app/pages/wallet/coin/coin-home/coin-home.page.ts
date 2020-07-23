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

import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Events } from '@ionic/angular';
import { Config } from '../../../../config/Config';
import { Native } from '../../../../services/native.service';
import { PopupProvider } from '../../../../services/popup.service';
import { Util } from '../../../../model/Util';
import { WalletManager } from '../../../../services/wallet.service';
import { TranslateService } from '@ngx-translate/core';
import { MasterWallet } from 'src/app/model/MasterWallet';
import { AppService } from 'src/app/services/app.service';
import { CoinTransferService } from 'src/app/services/cointransfer.service';
import { StandardCoinName, Coin, CoinType } from 'src/app/model/Coin';
import { SubWallet } from 'src/app/model/SubWallet';
import { TransactionDirection, TransactionStatus } from 'src/app/model/Transaction';
import { ThemeService } from 'src/app/services/theme.service';
import * as moment from 'moment';

@Component({
    selector: 'app-coin-home',
    templateUrl: './coin-home.page.html',
    styleUrls: ['./coin-home.page.scss'],
})
export class CoinHomePage implements OnInit {

    public masterWalletInfo = '';
    masterWallet: MasterWallet = null;
    subWallet: SubWallet = null;
    transferList = [];

    chainId: StandardCoinName = null;
    pageNo = 0;
    start = 0;

    isShowMore = false;
    MaxCount = 0;
    isNodata = false;
 
    public autoFefreshInterval: any;
    public votedCount = 0;

    Config = Config;
    SELA = Config.SELA;

    constructor(
        public route: ActivatedRoute,
        public walletManager: WalletManager,
        public translate: TranslateService,
        private coinTransferService: CoinTransferService,
        public native: Native,
        public events: Events,
        public popupProvider: PopupProvider, private appService: AppService,
        public theme: ThemeService
    ) {
        this.init();
    }

    ionViewWillEnter() {
        this.events.subscribe(this.chainId + ':syncprogress', (coin) => {
            this.initData();
        });

        this.appService.setBackKeyVisibility(true);
    }

    ionViewDidLeave() {
        this.events.unsubscribe(this.chainId + ':syncprogress');
        this.events.unsubscribe(this.chainId + ':synccompleted');
    }

    async init() {
        this.coinTransferService.reset();

        this.masterWallet = this.walletManager.getActiveMasterWallet();

        this.coinTransferService.reset();
        this.coinTransferService.walletInfo = this.native.clone(this.masterWallet.account);

        this.route.paramMap.subscribe((params) => {
            this.chainId = params.get('name') as StandardCoinName;
            this.appService.setTitleBarTitle(this.chainId);

            this.initData();

            if (this.walletManager.activeMasterWallet.subWallets[this.chainId].progress !== 100) {
                this.events.subscribe(this.chainId + ':synccompleted', (coin) => {
                    this.CheckPublishTx();
                    this.checkUTXOCount();
                });
            } else {
                this.CheckPublishTx();
                this.checkUTXOCount();
            }
        });
    }

    ngOnInit() {
    }

    initData() {
        this.subWallet = this.masterWallet.getSubWallet(this.chainId);

        this.pageNo = 0;
        this.start = 0;
        this.MaxCount = 0;
        this.transferList = [];
        this.getAllTx();
    }

    chainIsELA(): boolean {
        return this.chainId == StandardCoinName.ELA;
    }

    chainIsDID(): boolean {
        return this.chainId == StandardCoinName.IDChain;
    }

    async getAllTx() {
        let allTransactions = await this.subWallet.getTransactions(this.start);
        const transactions = allTransactions.Transactions;
        this.MaxCount = allTransactions.MaxCount;
        if (this.MaxCount > 0) {
            this.isNodata = false;
        } else {
            this.isNodata = true;
        }

        if (this.start >= this.MaxCount) {
            this.isShowMore = false;
            return;
        } else {
            this.isShowMore = true;
        }
        if (!transactions) {
            this.isShowMore = false;
            return;
        }

        if (this.MaxCount <= 20) {
            this.isShowMore = false;
        }

        for (const key in transactions) {
            if (transactions.hasOwnProperty(key)) {
                const transaction = transactions[key];
                const timestamp = transaction.Timestamp * 1000;
                const datetime = Util.dateFormat(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss');
                const txId = transaction.TxHash;
                let payStatusIcon: string = null;
                let name = '';
                let symbol = '';
                const type = transaction.Type;

                if (transaction.Direction === TransactionDirection.RECEIVED) {
                    payStatusIcon = './assets/buttons/receive.png';
                    name = 'Received ELA';
                    symbol = '+';

                    switch (type) {
                        case 6: // RechargeToSideChain
                            payStatusIcon = './assets/images/ela-coin.png';
                            name = 'FromELA';
                            break;
                        case 7: // WithdrawFromSideChain
                            payStatusIcon = './assets/images/id-coin.png';
                            name = 'FromDID';
                            break;
                        default:
                        break;
                    }
                } else if (transaction.Direction === TransactionDirection.SENT) {
                    payStatusIcon = './assets/buttons/send.png';
                    symbol = '-';
                    name = 'Sent ELA';

                    if (type === 8) { // TransferCrossChainAsset
                        if (this.chainId === 'ELA') {
                            payStatusIcon = './assets/images/id-coin.png';
                            name = 'ToDID';
                        } else { // IDChain
                            payStatusIcon = './assets/images/ela-coin.png';
                            name = 'ToELA';
                        }
                    }
                } else if (transaction.Direction === TransactionDirection.MOVED) {
                    payStatusIcon = './assets/buttons/transfer.png';
                    symbol = '';
                    name = 'Transfered ELA';

                    if (this.chainId === StandardCoinName.ELA) { // for now IDChian no vote
                        // vote transaction
                        const isVote = await this.isVoteTransaction(txId);
                        if (isVote) {
                            payStatusIcon = './assets/images/vote.png';
                            name = 'Vote';
                        }
                    } else if (this.chainId === StandardCoinName.IDChain) {
                        if (transaction.Type === 10) { // DID transaction
                            payStatusIcon = './assets/images/did.png';
                            name = 'DID';
                        }
                    }
                } else if (transaction.Direction === TransactionDirection.DEPOSIT) {
                    payStatusIcon = './assets/images/exchange-sub.png';
                    if (transaction.Amount > 0) {
                        symbol = '-';
                    } else {
                        symbol = '';
                    }
                }

                let status = '';
                switch (transaction.Status) {
                    case TransactionStatus.CONFIRMED:
                        status = 'Confirmed';
                        break;
                    case TransactionStatus.PENDING:
                        status = 'Pending';
                        break;
                    case TransactionStatus.UNCONFIRMED:
                        status = 'Unconfirmed';
                        break;
                }

                const transfer = {
                    'name': name,
                    'status': status,
                    'resultAmount': transaction.Amount / Config.SELA,
                    'datetime': datetime,
                    'timestamp': timestamp,
                    'txId': txId,
                    'payStatusIcon': payStatusIcon,
                    'symbol': symbol
                };
                this.transferList.push(transfer);
            }
        }
    }

    isVoteTransaction(txId: string): Promise<any> {
        return new Promise(async (resolve, reject)=>{
            let transactions = await this.walletManager.spvBridge.getAllTransactions(this.masterWallet.id, this.chainId, 0, txId);
            
            const transaction = transactions['Transactions'][0];
            if (!Util.isNull(transaction.OutputPayload) && (transaction.OutputPayload.length > 0)) {
                resolve(true);
            }
            else {
                resolve(false);
            }
        });
    }

    onItem(item) {
        this.native.go('/coin-tx-info', { chainId: this.chainId, txId: item.txId });
    }

    receiveFunds() {
        this.coinTransferService.transfer.chainId = this.chainId;
        this.native.go('/coin-receive');
    }

    transferFunds() {
        this.coinTransferService.transfer.chainId = this.chainId;
        this.coinTransferService.transfer.type = 'transfer';
        this.native.go('/coin-transfer');
    }

    rechargeFunds() {
        this.coinTransferService.transfer.chainId = this.chainId;
        this.coinTransferService.transfer.type = 'recharge';

        // Filter out the current chain id as this is our transfer source. We only want to pick
        // the destination subwallet.
        const subWallets = this.masterWallet.subWalletsWithExcludedCoin(this.chainId);
        if (subWallets.length === 1) {
            this.coinTransferService.transfer.sideChainId = subWallets[0].id;
            this.native.go('/coin-transfer');
        } else {
            this.native.go('/coin-select');
        }
    }

    withdrawFunds() {
        this.coinTransferService.transfer.chainId = this.chainId;
        this.coinTransferService.transfer.type = 'withdraw';
        this.native.go('/coin-transfer');
    }

    clickMore() {
        this.pageNo++;
        this.start = this.pageNo * 20;
        if (this.start >= this.MaxCount) {
            this.isShowMore = false;
            return;
        }
        this.isShowMore = true;
        this.getAllTx();
    }

    doRefresh(event) {
        this.initData();
        setTimeout(() => {
            event.target.complete();
        }, 1000);
    }

    CheckPublishTx() {
        for (const txId in this.walletManager.transactionMap) {
            if (this.getIndexByTxId(txId)) {
                delete this.walletManager.transactionMap[txId];
            }
        }

        console.log('Fail txId:', this.walletManager.transactionMap);
        for (const txId in this.walletManager.transactionMap) {
            this.popupProvider.ionicAlert_PublishedTx_fail('confirmTitle', txId, txId);
        }

        this.walletManager.cleanTransactionMap();
    }

    getIndexByTxId(txId: string) {
        return this.transferList.findIndex(e => e.txId === txId);
    }

    async checkUTXOCount() {
        // CHeck UTXOs only for SPV based coins.
        if (this.subWallet.type == CoinType.STANDARD) {
            if (this.walletManager.needToCheckUTXOCountForConsolidation) {
                let UTXOsJson = await this.walletManager.spvBridge.getAllUTXOs(this.masterWallet.id, this.chainId, 0, 1, '');
                console.log('UTXOsJson:', UTXOsJson);
                const UTXOsCount = this.translate.instant('text-consolidate-UTXO-counts', {count: UTXOsJson.MaxCount});
                if (UTXOsJson.MaxCount >= Config.UTXO_CONSOLIDATE_PROMPT_THRESHOLD) {
                    let ret = await this.popupProvider.ionicConfirmWithSubTitle('text-consolidate-prompt', UTXOsCount, 'text-consolidate-note')
                    if (ret) {
                        await this.createConsolidateTransaction();
                    }
                }

                this.walletManager.needToCheckUTXOCountForConsolidation = false;
            }
        }
    }

    async createConsolidateTransaction() {
        let txJson = await this.walletManager.spvBridge.createConsolidateTransaction(this.masterWallet.id, this.chainId, '');
        console.log('coin.page createConsolidateTransaction');
        let transfer = {
            chainId: this.chainId,
            toAddress: '',
            amount: '',
            memo: '',
            fee: 0,
            payPassword: '',
            rawTransaction: txJson,
        };
        this.walletManager.openPayModal(transfer);
    }

    getWholeBalance(balance: number): number {
        return Math.trunc(balance);
    }

    getDecimalBalance(balance: number): string {
        let decimalBalance = balance - Math.trunc(balance);
        decimalBalance.toFixed(5);
        return decimalBalance.toLocaleString().slice(2);
    }

    formatDate(date: string) {
        moment(date).format('MMMM Do YYYY, h:mm:ss a')
    }
}
