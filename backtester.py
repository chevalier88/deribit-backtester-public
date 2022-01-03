import json, sys
sys.path.append(".")
import pandas as pd
import time
from datetime import datetime
import ccxt 
from config_py_files import config

import websocket
from websocket import create_connection

import numpy as np
import math
from pandas.plotting import register_matplotlib_converters
from johansen import coint_johansen
import warnings

entered_params = json.loads(sys.argv[1])
# print(coin_params)
# print(type(entered_params))
# print(coin_params.keys())
# instantiate inputted params for this test, from a form

params = entered_params["params"]

since_day_input = params["since_day_input"]
front_leg_instrument = params["front_leg"]
middle_leg_instrument = params["mid_leg"]
back_leg_instrument = params["back_leg"]
tf = params["tf"]

# print(back_leg)
# will backtest all timeframes for this combi of legs. 

# instantiate other constants for this test
unix_now = int(time.time())*1000
lookback = 20
sl_std_dev = 1 #default is 1 standard deviation below and above bands

# standard code for the since day
if since_day_input == "default":
    since_day = '2021-06-01_00_00'
else: 
    since_day = since_day_input

# single dataframe builder
def dataframe_builder(sym, tf, since_day):
  since = round(datetime.strptime(str(since_day), '%Y-%m-%d_%H_%M').timestamp()*1000)

  msg = \
  {
    "jsonrpc" : "2.0",
    "id" : 833,
    "method" : "public/get_tradingview_chart_data",
    "params" : {
      "instrument_name" : sym,
      "start_timestamp" : since,
      "end_timestamp" : unix_now,
      "resolution" : tf
    }
  }

  # 'short-term' websocket connection to avoid ccxt, straight to mainnet
  # https://pypi.org/project/websocket-client/
  ws = create_connection('wss://www.deribit.com/ws/api/v2/')

#   print(f'Sending JSON message to get chart data for {sym} {tf}...')
  ws.send(json.dumps(msg))
#   print("Sent!")
  time.sleep(2)
#   print(f'Receiving message data for {sym} {tf}...')

  raw_result =  ws.recv()
  message = json.loads(raw_result)
#   print(message.keys())
  
  if 'result' in message.keys():
    # print('successful DF data message, compiling into single df...')
    # print(message["result"].keys())
    result_keys = message["result"]

    df = pd.DataFrame(result_keys, columns = ['volume', 'ticks', 'status', 'open', 'low', 'high', 'cost', 'close'])
    
    # print(df.head())

    ws.close()

    df.set_index('ticks', inplace=True)
    df = df[["close"]]

    #   print('checking out final df appearance...')
    #   print(df.head())

    df.rename(columns = {"close": sym}, inplace= True)
    # print(df.head())
    # print(f'single {sym} {tf} chart is length {len(df)}')

    # print(type(df))
    return df

  if 'error' in message.keys(): #turn into Asyn
    error_message = message['error']['message']
    error_code = message['error']['code']
    print('You have received an ERROR MESSAGE: {} with the ERROR CODE: {}'.format(error_message, error_code))
    print(message)
    pass  

def triple_df_builder(front_leg_instrument, middle_leg_instrument, back_leg_instrument, tf):
    #get leg 1
    try:
        df_front_leg = dataframe_builder(front_leg_instrument, tf, since_day)

        df_middle_leg = dataframe_builder(middle_leg_instrument, tf, since_day)

        df_back_leg = dataframe_builder(back_leg_instrument, tf, since_day)

        df = pd.concat([df_front_leg, df_middle_leg, df_back_leg], axis=1)
        
        #some contracts commence earlier than the others so we want to have the 3 instruments overlap 
        #for the butterfly spread to work
        df.dropna(inplace = True)

        # print(f'length of dataframe is {len(df)}')
        return df
    except:
        print('one of the legs are not processed')
        pass

def johansen_test(df):
    # print('running Johansen test...')
    register_matplotlib_converters()

    # For checking cointegration
    sys.path.append("..")
    warnings.filterwarnings('ignore')

    # Run Johansen test on the whole dataset

    # Store the results of Johansen test after applying on the dataframe
    result = coint_johansen(df, 0, 1)

    # Print trace statistics and eigen statistics
    # print ('--------------------------------------------------')
    # print ('--> Trace Statistics')
    # print ('variable statistic Crit-90% Crit-95%  Crit-99%')
    # for i in range(len(result.lr1)):
    #     print ("r <= " + str(i), round(result.lr1[i], 4), round(result.cvt[i, 0],4), round(result.cvt[i, 1],4), round(result.cvt[i, 2],4))
    # print ('--------------------------------------------------')
    # print ('--> Eigen Statistics')
    # print ('variable statistic Crit-90% Crit-95%  Crit-99%')
    # for i in range(len(result.lr2)):
    #     print ("r <= " + str(i), round(result.lr2[i], 4), round(result.cvm[i, 0],4), round(result.cvm[i, 1],4), round(result.cvm[i, 2],4))

    #Print half-life, or time taken for data to revert to mean
    theta = result.eig[0]
    half_life = math.log(2)/theta
    print ('--------------------------------------------------')
    print ('--> Half Life')
    print (f"The expected holding period is {half_life} periods.")

    # Store the results of Johansen test
    half_df_length = len(df)/2
    lookback_johansen = int(round(half_df_length)) #set to half of whatever dataframe, always.
    result = coint_johansen(df[:lookback_johansen], 0, 1)

    # Store the value of eigenvector. Using this eigenvector, you can create the spread
    ev = result.evec

    # Take the transpose and use the first row of eigenvectors as it forms strongest cointegrating spread 
    ev = result.evec.T[0]

    # Normalise the eigenvectors by dividing the row with the first value of eigenvector
    ev = ev/ev[0]

    front_vector = round(ev[0], 2)
    middle_vector = round(ev[1],2)
    back_vector = round(ev[2],2)

    # Print the mean reverting spread
    # print(f"\nCurrent Cointegrated Spread for {tf}= {front_vector}*{front_leg_instrument} + ({middle_vector})*{middle_leg_instrument} + ({back_vector})*{back_leg_instrument}")
    # print(f"Johansen test performed on {df.index[-1]}")
    return [front_vector, middle_vector, back_vector]

def butterfly_sl_backtester(df, front_vector, middle_vector, back_vector, lookback, std_dev, sl_flag, sl_std_dev, one_way_fee):
    # print('running new butterfly sl backtester...')    
    df['spread'] = df[front_leg_instrument]*front_vector + df[middle_leg_instrument]*middle_vector + df[back_leg_instrument]*back_vector

    # requires x and y plotting to be done in numpy arrays
    # print("Spread for Timeframe {0}, Lookback {1}, Std Deviation {2}".format(tf, lookback, std_dev))
    # spread_timestamps = list(df.index.values)
    # fig.plot(spread_timestamps, df["spread"], label="spread", width=50, height=15)    
    # fig.show()
    
    # Moving Average and Moving Standard Deviation
    df['moving_average'] = df.spread.rolling(lookback).mean()
    df['moving_std_dev'] = df.spread.rolling(lookback).std()

    # Upper band and lower band
    df['upper_band'] = df.moving_average + std_dev*df.moving_std_dev
    df['lower_band'] = df.moving_average - std_dev*df.moving_std_dev

    # Long entries
    df['long_entry'] = df.spread < df.lower_band
    df['long_exit'] = df.spread >= df.moving_average

    # Short entries
    df['short_entry'] = df.spread > df.upper_band
    df['short_exit'] = df.spread <= df.moving_average

    #binary positions tracking
    df['positions_long'] = np.nan
    df.loc[df.long_entry, 'positions_long'] = 1
    df.loc[df.long_exit, 'positions_long'] = 0
    df['positions_short'] = np.nan
    df.loc[df.short_entry, 'positions_short'] = -1
    df.loc[df.short_exit, 'positions_short'] = 0

    # ------------------------- Stop Loss Logic -------------------------------
    if sl_flag:
        # Add a stop loss x standard deviation away from lower band.
        # For example, refer to the above markdown cell
        df['long_sl'] = df.spread < (df.lower_band - sl_std_dev*df.moving_std_dev)

        # Whenever the long_sl is True, set the positions_long_sl to 0
        df.loc[df.long_sl, 'positions_long_sl'] = 0

        # Whenever the price reverts to the mean, set the positions_long_sl to 1
        df.loc[df.long_exit, 'positions_long_sl'] = 1

        # Add a stop loss x standard deviation away from upper band.
        df['short_sl'] = df.spread > (df.upper_band + sl_std_dev*df.moving_std_dev)

        # Similar to above but for short side
        df.loc[df.short_sl, 'positions_short_sl'] = 0
        df.loc[df.short_exit, 'positions_short_sl'] = 1
        df = df.fillna(method='ffill')

        # Multiply with the positions column to include the impact of the stop loss
        df.positions_long = df.positions_long * df.positions_long_sl
        df.positions_short = df.positions_short * df.positions_short_sl

    # Fill NaN values
    df = df.fillna(method='ffill')

    # Consolidate the positions
    df['positions'] = df.positions_long + df.positions_short

    # Calculate spread difference
    df['spread_diff'] = df.spread-df.spread.shift(1)

    # Calculate portfolio value
    df['portfolio_value'] = abs(front_vector)*df[front_leg_instrument] + abs(middle_vector)*df[middle_leg_instrument] + abs(back_vector)*df[back_leg_instrument]

    # Calculate daily returns
    df['daily_returns'] = df.spread_diff / df['portfolio_value'].shift(1)

    # Calculate strategy returns
    df['strategy_returns'] = df.daily_returns  * df.positions.shift(1)


    # Calculate fresh entries
    # fresh longs & shorts, where previously positions = 0.
    # from adapting shift() - https://stackoverflow.com/questions/41399538/comparing-previous-row-values-in-pandas-dataframe
    
    df['fresh_entry'] = np.where(((df['positions']==-1) | (df['positions']==1)) & (df['positions'].shift()==0), True, False)

    # Calculate fresh exits
    df['fresh_exit'] = np.where(((df['positions'].shift()==-1) | (df['positions'].shift()==1)) & (df['positions']==0), True, False)

    # Calculate one way butterfly fees
    df['one_way_fee'] = np.where(((df['fresh_entry'] == True) | (df['fresh_exit']== True)), one_way_fee, 0)

    # Calculate net strategy returns, after fees
    df['net_strategy_returns'] = df["strategy_returns"] + df["one_way_fee"]

    df = df.dropna()

    # Calculate cumulative strategy returns
    df['cumret'] = ((df.net_strategy_returns+1)).cumprod()

    # print("{0}, {1}, {2} Butterfly Returns with Timeframe {3}, Lookback {4}, Std Deviation {5}".format(front_leg_instrument, middle_leg_instrument, back_leg_instrument, tf,lookback, std_dev ))
    
    #PLOTTING NOT COMPATIBLE WITH .PY SCRIPT IN TERMINAL
    # df.cumret.plot(figsize=(10,5))
    # plt.title("{0}, {1}, {2} Butterfly Returns with Timeframe {3}, Lookback {4}, Std Deviation {5}".format(front_leg_instrument, middle_leg_instrument, back_leg_instrument, tf,lookback, std_dev ))
    # plt.xlabel('Date')  
    # plt.ylabel('Cumulative Returns')  
    # plt.legend()  
    # plt.show()
    
    length = len(df.index)
    last_index = len(df.index) - 1
    # print(last_index)
    ROI = df['cumret'].iloc[last_index]
    ROI = ROI.item()

    # print(f'ROI is {df["cumret"].iloc[last_index]} for {tf}')
    # print(f'length of {tf} dataframe is {len(df)}')
    
    #PLOTTING NOT COMPATIBLE WITH .PY SCRIPT IN TERMINAL
    # df[['spread','moving_average',"lower_band",'upper_band']].plot(figsize=(10,4))
    # plt.grid(True)
    # plt.title("{0}, {1}, {2} Butterfly Bollinger Bands with Timeframe {3}".format(front_leg_instrument, middle_leg_instrument, back_leg_instrument, tf))
    # plt.axis('tight')
    # plt.ylabel('Price')
    
    output_string = [{
        "front_leg": front_leg_instrument, 
        "middle_leg": middle_leg_instrument, 
        "back_leg" : back_leg_instrument, 
        "tf": tf, 
        "ROI": ROI,
        "length": length,
        "lookback": lookback,
        "std_dev": std_dev,
        "front_vector": front_vector,
        "middle_vector": middle_vector,
        "back_vector": back_vector,
    }]

    json_df = df.to_json (orient="columns")

    return [output_string, json_df]

# get df
df = triple_df_builder(front_leg_instrument, middle_leg_instrument, back_leg_instrument, tf)

# get vectors
vectors = johansen_test(df)
# print('printing all vectors...')
print(vectors)
front_vector = vectors[0]
middle_vector = vectors[1]
back_vector = vectors[2]

single_result = butterfly_sl_backtester(df, front_vector, middle_vector, back_vector, 20, 2, True, 1, -0.0015)

# get output string


# dataframe to json
# https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.to_json.html

sys.stdout.write(single_result)

# exportable_df = tuple_returned[1]

# exportable_df.to_csv(f'./data/{test_timestamp}_{tf}_running.csv')