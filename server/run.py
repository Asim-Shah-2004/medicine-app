from app import create_app

# Provide the config_name parameter
app = create_app('development')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')