import json, sys
from os import close
sys.path.append(".")
import pandas as pd
import time
from datetime import datetime

import numpy as np
import math
from pandas.plotting import register_matplotlib_converters
from johansen import coint_johansen
import warnings

# df_object = json.loads(sys.argv[1])
df_object = pd.read_json(sys.argv[1])


# print('printing df_object...')
# print(df_object.head())
# print(df_object.columns)

# print(df_object.iloc[0])

now = datetime.now().strftime(("%d_%m_%Y_%H_%M_%S"))

front_leg_instrument = df_object.iloc[0]["leg"]
middle_leg_instrument = df_object.iloc[1]["leg"]
back_leg_instrument = df_object.iloc[2]["leg"]
tf = int(df_object.iloc[3]["tf"])

# print(f'tf is {tf}')
# print(f'front_leg_instrument = {front_leg_instrument}')

# tick_index = first_df["ticks"]
# close_price = first_df["close"]
# leg_name = first_df["leg"]

# temp_dict = {'ticks': tick_index, leg_name: close_price}

# converted_first_df = pd.DataFrame(temp_dict)
# converted_first_df.set_index('ticks', inplace= True)
# print(converted_first_df.head())
# print(f'length: {len(converted_first_df.index)}')

def json_df_converter(df_object, object_index):
    raw_df = df_object.iloc[object_index]
    tick_index = raw_df["ticks"]
    close_price = raw_df["close"]
    leg_name = raw_df["leg"]

    temp_dict = {'ticks': tick_index, leg_name: close_price}
    converted_df = pd.DataFrame(temp_dict)
    converted_df.set_index('ticks', inplace= True)
    return converted_df

def triple_df_builder(df_object):
    #get leg 1
    try:
        df_front_leg = json_df_converter(df_object, 0)

        df_middle_leg = json_df_converter(df_object, 1)

        df_back_leg = json_df_converter(df_object, 2)

        df = pd.concat([df_front_leg, df_middle_leg, df_back_leg], axis=1)
        
        #some contracts commence earlier than the others so we want to have the 3 instruments overlap 
        #for the butterfly spread to work
        df.dropna(inplace = True)

        # print(f'length of dataframe is {len(df)}')
        return df
    except:
        print('one of the legs are not processing')
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
    # print ('--------------------------------------------------')
    # print ('--> Half Life')
    # print (f"The expected holding period is {half_life} periods.")

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
    
    output_string = {
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
        "backtest_timestamp": f'{now}_TF{tf}',
    }
    # print(df.head())

    return [output_string, df]
    # return df_json

df = triple_df_builder(df_object)
# get vectors
vectors = johansen_test(df)
# print('printing all vectors...')
# print(vectors)
front_vector = vectors[0]
middle_vector = vectors[1]
back_vector = vectors[2]

single_result = butterfly_sl_backtester(df, front_vector, middle_vector, back_vector, 20, 2, True, 1, -0.0015)

# get length of dataframe

select_df = single_result[1]
exportable_df = select_df["cumret"]
df_length = len(exportable_df.index)
# print(df_length)

#to reduce size, only select every nth row to achieve 100 rows only
# based on https://stackoverflow.com/questions/25055712/pandas-every-nth-row 
nth_factor = int(df_length/100)-1
# print(nth_factor)

df = exportable_df.iloc[::nth_factor]

json_df = df.to_json(f'./data/{now}_{tf}_running.json', orient = 'columns')
# df.to_csv(f'./data/{now}_{tf}_running.csv')

# trying ot read exported json file for sys.stdout.write sending
# https://www.geeksforgeeks.org/read-json-file-using-python/
# f = open(f"./data/{now}_{tf}_running.json")
# print(json_df)
# json_df = json.load(f)

# get output string
# print(single_result[0])
sys.stdout.write(json.dumps(single_result[0]))

# dataframe to json
# https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.to_json.html
# json_df = single_result[1].to_json(orient = "columns")
# print(str(json_df))

# sys.stdout.write(json.dumps(json_df))