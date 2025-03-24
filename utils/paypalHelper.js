const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

/**
 * PayPal設定とAPI呼び出しのためのヘルパーモジュール
 */

// PayPalの環境設定
function environment() {
  const clientId = process.env.PAYPAL_CLIENT_ID || 'AR-v6denWr1Ip-CY0KVr_MWh6JBEFoXp_ZQhhEGRNjpUDgjedN4kcOzPb0i1tLfrM3MYcVqExkNyyoMc';
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || 'YOUR_PAYPAL_CLIENT_SECRET';

  // 本番環境かテスト環境かを判定
  if (process.env.NODE_ENV === 'production') {
    return new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret);
  }
  return new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
}

// PayPalクライアントを設定
function client() {
  return new checkoutNodeJssdk.core.PayPalHttpClient(environment());
}

// サブスクリプション詳細の取得
async function getSubscriptionDetails(subscriptionId) {
  try {
    // テストモードでの仮の応答を返す
    if (process.env.NODE_ENV !== 'production' || process.env.PAYPAL_TEST_MODE === 'true') {
      console.log('PayPal API テストモードで動作中: サブスクリプション詳細を模擬データで返します');
      
      // プランIDを判定（年間か月額か）
      const isAnnual = subscriptionId.includes('14541775CP597184JM7Q2HTA');
      
      return {
        success: true,
        subscription: {
          id: subscriptionId,
          plan_id: isAnnual ? 'P-14541775CP597184JM7Q2HTA' : 'P-5GM64833J5530234JM7QPGWI',
          status: 'ACTIVE',
          start_time: new Date().toISOString(),
          billing_info: {
            next_billing_time: new Date(Date.now() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
            last_payment: {
              amount: {
                value: isAnnual ? '9800' : '980',
                currency_code: 'JPY'
              }
            }
          }
        }
      };
    }
    
    // 実際のAPIコール
    const request = new checkoutNodeJssdk.subscriptions.SubscriptionsGetRequest(subscriptionId);
    const response = await client().execute(request);
    
    return {
      success: true,
      subscription: response.result
    };
  } catch (err) {
    console.error('サブスクリプション詳細取得エラー:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

// サブスクリプションのキャンセル
async function cancelSubscription(subscriptionId, reason) {
  try {
    if (process.env.NODE_ENV !== 'production' || process.env.PAYPAL_TEST_MODE === 'true') {
      console.log('PayPal API テストモードで動作中: サブスクリプションキャンセルを模擬します');
      return {
        success: true
      };
    }
    
    const request = new checkoutNodeJssdk.subscriptions.SubscriptionsCancelRequest(subscriptionId);
    request.requestBody({
      reason: reason || 'ユーザーリクエスト'
    });
    
    await client().execute(request);
    
    return {
      success: true
    };
  } catch (err) {
    console.error('サブスクリプションキャンセルエラー:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

// トランザクション詳細の取得
async function getTransactionDetails(transactionId) {
  try {
    if (process.env.NODE_ENV !== 'production' || process.env.PAYPAL_TEST_MODE === 'true') {
      console.log('PayPal API テストモードで動作中: トランザクション詳細を模擬データで返します');
      return {
        success: true,
        transaction: {
          id: transactionId,
          status: 'COMPLETED',
          amount: {
            value: '980',
            currency_code: 'JPY'
          },
          create_time: new Date().toISOString()
        }
      };
    }
    
    const request = new checkoutNodeJssdk.orders.OrdersGetRequest(transactionId);
    const response = await client().execute(request);
    
    return {
      success: true,
      transaction: response.result
    };
  } catch (err) {
    console.error('トランザクション詳細取得エラー:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

// サブスクリプションステータスの更新
async function updateSubscriptionStatus(subscriptionId, status) {
  try {
    if (process.env.NODE_ENV !== 'production' || process.env.PAYPAL_TEST_MODE === 'true') {
      console.log('PayPal API テストモードで動作中: サブスクリプションステータス更新を模擬します');
      return {
        success: true
      };
    }
    
    const request = new checkoutNodeJssdk.subscriptions.SubscriptionsPatchRequest(subscriptionId);
    request.requestBody([
      {
        op: 'replace',
        path: '/status',
        value: status
      }
    ]);
    
    await client().execute(request);
    
    return {
      success: true
    };
  } catch (err) {
    console