<?php

/**
 * PHPMailer POP-Before-SMTP Authentication Class.
 * PHP Version 5.5.
 *
 * @see https://github.com/PHPMailer/PHPMailer/ The PHPMailer GitHub project
 *
 * @author    Marcus Bointon (Synchro/coolbru) <phpmailer@synchromedia.co.uk>
 * @author    Jim Jagielski (jimjag) <jimjag@gmail.com>
 * @author    Andy Prevost (codeworxtech) <codeworxtech@users.sourceforge.net>
 * @author    Brent R. Matzelle (original founder)
 * @copyright 2012 - 2020 Marcus Bointon
 * @copyright 2010 - 2012 Jim Jagielski
 * @copyright 2004 - 2009 Andy Prevost
 * @license   http://www.gnu.org/copyleft/lesser.html GNU Lesser General Public License
 * @note      This program is distributed in the hope that it will be useful - WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.
 */

namespace PHPMailer\PHPMailer;

/**
 * PHPMailer POP-Before-SMTP Authentication Class.
 * Specifically for PHPMailer to use for RFC1939 POP-before-SMTP authentication.
 * 1) This class does not support APOP authentication.
 * 2) Opening and closing lots of POP3 connections can be quite slow. If you need
 *   to send a batch of emails then just perform the authentication once at the start,
 *   and then loop through your mail sending script. Providing this process doesn't
 *   take longer than the verification period lasts on your POP3 server, you should be fine.
 * 3) This is really ancient technology; you should only need to use it to talk to very old systems.
 * 4) This POP3 class is deliberately lightweight and incomplete, implementing just
 *   enough to do authentication.
 *   If you want a more complete class there are other POP3 classes for PHP available.
 *
 * @author Richard Davey (original author) <rich@corephp.co.uk>
 * @author Marcus Bointon (Synchro/coolbru) <phpmailer@synchromedia.co.uk>
 * @author Jim Jagielski (jimjag) <jimjag@gmail.com>
 * @author Andy Prevost (codeworxtech) <codeworxtech@users.sourceforge.net>
 */
class POP3
{
    /**
     * The POP3 PHPMailer Version number.
     *
     * @var string
     */
    const VERSION = '6.9.1';

    /**
     * Default POP3 port number.
     *
     * @var int
     */
    const DEFAULT_PORT = 110;

    /**
     * Default timeout in seconds.
     *
     * @var int
     */
    const DEFAULT_TIMEOUT = 30;

    /**
     * POP3 class debug output mode.
     * Debug output level.
     * Options:
     * @see POP3::DEBUG_OFF: No output
     * @see POP3::DEBUG_SERVER: Server messages, connection/server errors
     * @see POP3::DEBUG_CLIENT: Client and Server messages, connection/server errors
     *
     * @var int
     */
    public $do_debug = self::DEBUG_OFF;

    /**
     * POP3 mail server hostname.
     *
     * @var string
     */
    public $host;

    /**
     * POP3 port number.
     *
     * @var int
     */
    public $port;

    /**
     * POP3 Timeout Value in seconds.
     *
     * @var int
     */
    public $tval;

    /**
     * POP3 username.
     *
     * @var string
     */
    public $username;

    /**
     * POP3 password.
     *
     * @var string
     */
    public $password;

    /**
     * Resource handle for the POP3 connection socket.
     *
     * @var resource
     */
    protected $pop_conn;

    /**
     * Are we connected?
     *
     * @var bool
     */
    protected $connected = false;

    /**
     * Error container.
     *
     * @var array
     */
    protected $errors = [];

    /**
     * Line break constant.
     */
    const LE = "\r\n";

    /**
     * Debug level for no output.
     *
     * @var int
     */
    const DEBUG_OFF = 0;

    /**
     * Debug level to show server -> client messages
     * also shows clients connection errors or errors from server
     *
     * @var int
     */
    const DEBUG_SERVER = 1;

    /**
     * Debug level to show client -> server and server -> client messages.
     *
     * @var int
     */
    const DEBUG_CLIENT = 2;

    /**
     * Simple static wrapper for all-in-one POP before SMTP.
     *
     * @param string   $host        The hostname to connect to
     * @param int|bool $port        The port number to connect to
     * @param int|bool $timeout     The timeout value
     * @param string   $username
     * @param string   $password
     * @param int      $debug_level
     *
     * @return bool
     */
    public static function popBeforeSmtp(
        $host,
        $port = false,
        $timeout = false,
        $username = '',
        $password = '',
        $debug_level = 0
    ) {
        $pop = new self();

        return $pop->authorise($host, $port, $timeout, $username, $password, $debug_level);
    }

    /**
     * Authenticate with a POP3 server.
     * A connect, login, disconnect sequence
     * appropriate for POP-before SMTP authorisation.
     *
     * @param string   $host        The hostname to connect to
     * @param int|bool $port        The port number to connect to
     * @param int|bool $timeout     The timeout value
     * @param string   $username
     * @param string   $password
     * @param int      $debug_level
     *
     * @return bool
     */
    public function authorise($host, $port = false, $timeout = false, $username = '', $password = '', $debug_level = 0)
    {
        $this->host = $host;
        //If no port value provided, use default
        if (false === $port) {
            $this->port = static::DEFAULT_PORT;
        } else {
            $this->port = (int) $port;
        }
        //If no timeout value provided, use default
        if (false === $timeout) {
            $this->tval = static::DEFAULT_TIMEOUT;
        } else {
            $this->tval = (int) $timeout;
        }
        $this->do_debug = $debug_level;
        $this->username = $username;
        $this->password = $password;
        //Reset the error log
        $this->errors = [];
        //Connect
        $result = $this->connect($this->host, $this->port, $this->tval);
        if ($result) {
            $login_result = $this->login($this->username, $this->password);
            if ($login_result) {
                $this->disconnect();

                return true;
            }
        }
        //We need to disconnect regardless of whether the login succeeded
        $this->disconnect();

        return false;
    }

    /**
     * Connect to a POP3 server.
     *
     * @param string   $host
     * @param int|bool $port
     * @param int      $tval
     *
     * @return bool
     */
    public function connect($host, $port = false, $tval = 30)
    {
        //Are we already connected?
        if ($this->connected) {
            return true;
        }

        //On Windows this will raise a PHP Warning error if the hostname doesn't exist.
        //Rather than suppress it with @fsockopen, capture it cleanly instead
        set_error_handler([$this, 'catchWarning']);

        if (false === $port) {
            $port = static::DEFAULT_PORT;
        }

        //Connect to the POP3 server
        $errno = 0;
        $errstr = '';
        $this->pop_conn = fsockopen(
            $host, //POP3 Host
            $port, //Port #
            $errno, //Error Number
            $errstr, //Error Message
            $tval
        ); //Timeout (seconds)
        //Restore the error handler
        restore_error_handler();

        //Did we connect?
        if (false === $this->pop_conn) {
            //It would appear not...
            $this->setError(
                "Failed to connect to server $host on port $port. errno: $errno; errstr: $errstr"
            );

            return false;
        }

        //Increase the stream time-out
        stream_set_timeout($this->pop_conn, $tval, 0);

        //Get the POP3 server response
        $pop3_response = $this->getResponse();
        //Check for the +OK
        if ($this->checkResponse($pop3_response)) {
            //The connection is established and the POP3 server is talking
            $this->connected = true;

            return true;
        }

        return false;
    }

    /**
     * Log in to the POP3 server.
     * Does not support APOP (RFC 2828, 4949).
     *
     * @param string $username
     * @param string $password
     *
     * @return bool
     */
    public function login($username = '', $password = '')
    {
        if (!$this->connected) {
            $this->setError('Not connected to POP3 server');
            return false;
        }
        if (empty($username)) {
            $username = $this->username;
        }
        if (empty($password)) {
            $password = $this->password;
        }

        //Send the Username
        $this->sendString("USER $username" . static::LE);
        $pop3_response = $this->getResponse();
        if ($this->checkResponse($pop3_response)) {
            //Send the Password
            $this->sendString("PASS $password" . static::LE);
            $pop3_response = $this->getResponse();
            if ($this->checkResponse($pop3_response)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Disconnect from the POP3 server.
     */
    public function disconnect()
    {
        // If could not connect at all, no need to disconnect
        if ($this->pop_conn === false) {
            return;
        }

        $this->sendString('QUIT' . static::LE);

        // RFC 1939 shows POP3 server sending a +OK response to the QUIT command.
        // Try to get it.  Ignore any failures here.
        try {
            $this->getResponse();
        } catch (Exception $e) {
            //Do nothing
        }

        //The QUIT command may cause the daemon to exit, which will kill our connection
        //So ignore errors here
        try {
            @fclose($this->pop_conn);
        } catch (Exception $e) {
            //Do nothing
        }

        // Clean up attributes.
        $this->connected = false;
        $this->pop_conn  = false;
    }

    /**
     * Get a response from the POP3 server.
     *
     * @param int $size The maximum number of bytes to retrieve
     *
     * @return string
     */
    protected function getResponse($size = 128)
    {
        $response = fgets($this->pop_conn, $size);
        if ($this->do_debug >= self::DEBUG_SERVER) {
            echo 'Server -> Client: ', $response;
        }

        return $response;
    }

    /**
     * Send raw data to the POP3 server.
     *
     * @param string $string
     *
     * @return int
     */
    protected function sendString($string)
    {
        if ($this->pop_conn) {
            if ($this->do_debug >= self::DEBUG_CLIENT) { //Show client messages when debug >= 2
                echo 'Client -> Server: ', $string;
            }

            return fwrite($this->pop_conn, $string, strlen($string));
        }

        return 0;
    }

    /**
     * Checks the POP3 server response.
     * Looks for for +OK or -ERR.
     *
     * @param string $string
     *
     * @return bool
     */
    protected function checkResponse($string)
    {
        if (strpos($string, '+OK') !== 0) {
            $this->setError("Server reported an error: $string");

            return false;
        }

        return true;
    }

    /**
     * Add an error to the internal error store.
     * Also display debug output if it's enabled.
     *
     * @param string $error
     */
    protected function setError($error)
    {
        $this->errors[] = $error;
        if ($this->do_debug >= self::DEBUG_SERVER) {
            echo '<pre>';
            foreach ($this->errors as $e) {
                print_r($e);
            }
            echo '</pre>';
        }
    }

    /**
     * Get an array of error messages, if any.
     *
     * @return array
     */
    public function getErrors()
    {
        return $this->errors;
    }

    /**
     * POP3 connection error handler.
     *
     * @param int    $errno
     * @param string $errstr
     * @param string $errfile
     * @param int    $errline
     */
    protected function catchWarning($errno, $errstr, $errfile, $errline)
    {
        $this->setError(
            'Connecting to the POP3 server raised a PHP warning:' .
            "errno: $errno errstr: $errstr; errfile: $errfile; errline: $errline"
        );
    }
}
